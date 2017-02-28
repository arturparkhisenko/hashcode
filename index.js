const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

const test = false;

let files = test ? ['data-examples/example.in'] : [
  // 'data-examples/kittens.in',
  'data-examples/me_at_the_zoo.in',
  // 'data-examples/trending_today.in',
  // 'data-examples/videos_worth_spreading.in'
];

// V E R C X (example: 10000 1000 200000 500 6000)
//
// V - videos,
// E - endpoints,
// R - request descriptions
// C - cache servers
// X - capacity in mb of each server
//
// s2 videos sizes
// s3 endpoint {latency, cacheServersNum}
// s4 videoStats {requests, id, endpointId}

console.log(`OS cores (${os.cpus().length})!`);

for (const fileName of files) {
  console.log(`Reading file: ${fileName}!`);
  processFile(fileName);
}

function processFile(fileName) {
  fs.readFile(path.resolve(__dirname, fileName), 'utf8',
    /**
     * fs callback
     * @param  {Object} err
     * @param  {String} data
     */
    function(err, data) {
      if (err) {
        return console.log(err);
      }

      const timeLabel = `Time-for-${fileName}`;
      console.time(timeLabel);
      console.log(`File opened: ${fileName}!`);

      let dataArray = data.split('\n');
      if (dataArray[dataArray.length - 1] === '') {
        dataArray.pop(); // trim trailing whitespace
      }
      // console.log(dataArray);
      const firstLine = dataArray[0].split(' ');
      // const V = parseInt(firstLine[0]);
      // const E = parseInt(firstLine[1]);
      // const R = parseInt(firstLine[2]);
      // const C = parseInt(firstLine[3]);
      const X = parseInt(firstLine[4]);
      // console.log({V, E, R, C, X});

      const videoSizes = dataArray[1].split(' ');
      console.log('VideoSizes received!');
      // console.log(videoSizes);

      dataArray.shift();
      dataArray.shift(); // to get data only
      // console.log(dataArray);

      const splittedData = dataSplitter(dataArray);
      console.log('Data splitted!');

      // sort videos by requests
      let videos = splittedData.videoStats.sort(
        (a, b) => b.requests - a.requests
      );
      // add video size
      videos = videos.map((video, i) => {
        video.size = parseInt(videoSizes[videos[i].videoId]);
        return video;
      });
      // delete video with size bigger than X capacity
      videos = videos.filter(el => videoSizes[el.videoId] < X);
      console.log('Videos sorted and filtered');
      // console.log(videos);

      const servers = getServers(X, splittedData, videos);
      console.log('Servers sorted / filtered / filled received!');
      const distribution = getCacheServersDistribution(servers, videos);
      console.log('Distribution finished!');
      const cacheServersNum = distribution.length;

      let results = `${cacheServersNum}\n`;

      // console.log(distribution);

      for (let i = 0; i < distribution.length; i++) {
        results += `${distribution[i].id}`;
        for (let j = 0; j < distribution[i].videoIds.length; j++) {
          results += ` ${distribution[i].videoIds[j]}`;
        }
        results += `\n`;
      }

      // example: output to file
      // 3 - how much cache servers
      // serverId videoId videoId
      // 0        2       3

      console.timeEnd(timeLabel);

      console.log('\nDistribution results:\n', results);
      writeResults(results, fileName);
    }
  );
}

// const toFastProperties = (o) => {
//   function f() {}
//   f.prototype = o;
//   return new f;
// }

const getVideoId = (videos, videoId, endpointId) => {
  let result = -1;
  for (let i = 0; i < videos.length; i++) {
    if (videos[i].videoId === videoId &&
      videos[i].endpointId === endpointId) {
      result = i;
      break;
    }
  }
  return result;
};

const dataSplitter = (data = []) => {
  let result = {
    endpoints: [],
    videoStats: []
  };
  let currentEndpointId = 0;
  for (let i = 0; i < data.length; i++) {
    const line = data[i].split(' ');
    if (line.length === 2) {
      let latencies = parseInt(line[1]) ? getLatencies(data, i + 1, parseInt(line[1])) : [];
      // latencies = JSON.stringify(latencies);
      let endpoint = {
        id: currentEndpointId,
        latency: parseInt(line[0]),
        cacheServersNum: parseInt(line[1]),
        latencies: latencies
      };
      result.endpoints.push(endpoint);
      currentEndpointId++;
      i += endpoint.cacheServersNum;
      continue;
    }
    if (line.length === 3) {
      let video = {
        videoId: parseInt(line[0]),
        endpointId: parseInt(line[1]),
        requests: parseInt(line[2])
      };
      const existingVideoId = getVideoId(result.videoStats, video.videoId, video.endpointId);
      if (existingVideoId >= 0) {
        result.videoStats[existingVideoId].requests += video.requests;
      } else {
        result.videoStats.push(video);
      }
    }
  }
  // console.log(result);
  return result;
};

const getLatencies = (data, index, num) => {
  let result = [];
  for (let i = index; i < index + num; i++) {
    const cacheServerStats = data[i].split(' ');
    result.push({
      cacheServerId: parseInt(cacheServerStats[0]),
      latencyToTheCacheServer: parseInt(cacheServerStats[1])
    });
  }
  return result;
};

const checkCapacity = (videoSize, serverRemainingCapacity) => videoSize <= serverRemainingCapacity;

const checkIfVideoIsIn = (arrayOfVideos, videoId) => arrayOfVideos.indexOf(videoId) < 0;

const checkIfEndpointFound = (endpoints, videoId) => {
  let result = false;
  for (let endpoint of endpoints) {
    if (endpoint.endpointId === videoId) {
      result = true;
      break;
    }
  }
  return result;
};

const sharding = (cacheServers, videos) => {
  //fill servers, second step (sharding), check if video was already added!
  let sortedCacheServers = Object.assign([], cacheServers);
  for (let i = 0; i < sortedCacheServers.length; i++) {
    let cacheServer = sortedCacheServers[i];
    // console.log({cacheServer, videos});
    for (let j = 0; j < videos.length; j++) {
      const videoObj = videos[j];
      // console.log('videosObj: ', videoObj); // with endpointId
      if (
        checkIfEndpointFound(cacheServer.endpoints, videoObj.endpointId) &&
        checkCapacity(videoObj.size, cacheServer.remainingCapacity) &&
        checkIfVideoIsIn(cacheServer.videoIds, videoObj.videoId)
      ) {
        cacheServer.remainingCapacity -= videoObj.size;
        cacheServer.videoIds.push(videoObj.videoId);
      }
    }
  }
  return sortedCacheServers;
};

const getPriorityEndpointsIds = (endpoints) => {
  let IDs = [];
  let averageLatency = 0;
  for (let endpoint of endpoints) {
    averageLatency += endpoint.latency;
  }
  averageLatency /= endpoints.length;
  for (let endpoint of endpoints) {
    if (endpoint.latency > averageLatency) {
      break;
    }
    IDs.push(endpoint.endpointId);
  }
  // console.log({averageLatency, endpointsLength: endpoints.length, IDs});
  return IDs;
};

const getPriorityVideosLength = (endpoint, videos) => {
  if (!videos || !videos.length) {
    return 0;
  }
  let videosLength = 1;
  let averageRequests = 0;
  let averageRequestsLength = 0;

  const filteredVideos = videos.filter(video => endpoint.endpointId === video.endpointId);

  for (let i = 0; i < filteredVideos.length; i++) {
    if (endpoint.endpointId === filteredVideos[i].endpointId) {
      averageRequests += filteredVideos[i].requests;
      averageRequestsLength++;
    }
  }
  averageRequests /= averageRequestsLength;
  // console.log({averageRequests, averageRequestsLength});

  for (let i = 1; i < filteredVideos.length; i++) {
    if (filteredVideos[i].requests <= averageRequests) {
      videosLength = i;
      break;
    }
  }

  return videosLength;
};

const getVideosForEndpoint = (videos, endpointId) => {
  return videos.filter(value => value.endpointId === endpointId);
};

// TODO optimize that:
const getServers = (X, splittedData, videos) => {
  // add latency to server
  let tempServers = {};
  for (let j = 0; j < splittedData.endpoints.length; j++) {
    console.log(`Servers filling with endpoint num ${j} of (${splittedData.endpoints.length})`);
    let latencies = splittedData.endpoints[j].latencies;
    // console.log(latencies);
    for (let i = 0; i < latencies.length; i++) {
      let tempServer = tempServers[latencies[i].cacheServerId];
      if (!tempServer) {
        tempServers[latencies[i].cacheServerId] = {
          midLatency: 0,
          endpoints: []
        };
      }
      //count mid latency
      tempServers[latencies[i].cacheServerId].midLatency += latencies[i].latencyToTheCacheServer;

      // endpoints
      tempServers[latencies[i].cacheServerId].endpoints.push({
        endpointId: j,
        latency: latencies[i].latencyToTheCacheServer,
        videos: getVideosForEndpoint(videos, j)
      });
    }
    for (let i = 0; i < latencies.length; i++) {
      let tempServer = tempServers[latencies[i].cacheServerId];
      if (tempServer) {
        tempServers[latencies[i].cacheServerId].midLatency /= latencies.length;
        break;
      }
    }
  }

  // console.log(tempServers);
  // console.log(JSON.stringify(tempServers));

  console.log('Servers gathered with data!');

  // sort by min mid latency
  let sortedCacheServers = [];
  Object.keys(tempServers).forEach(function(server, index) {
    // console.log({server, index});
    sortedCacheServers.push({
      remainingCapacity: X,
      id: index,
      midLatency: tempServers[server].midLatency,
      endpoints: tempServers[server].endpoints,
      videoIds: []
    });
  });
  sortedCacheServers.sort((a, b) => a.midLatency - b.midLatency);
  // console.log(sortedCacheServers);

  // sort endpoints of each server by latency
  for (let i = 0; i < sortedCacheServers.length; i++) {
    sortedCacheServers[i].endpoints.sort((a, b) => a.latency - b.latency);
  }
  // console.log(sortedCacheServers);

  console.log(`Servers (${sortedCacheServers.length}) sorted and filled with endpoints`);

  return sortedCacheServers;
};

const getCacheServersDistribution = (sortedCacheServersIn, videos) => {
  let sortedCacheServers = Object.assign([], sortedCacheServersIn);

  // TODO fork 4 processes
  // https://nodejs.org/dist/latest-v7.x/docs/api/child_process.html#child_process_child_process_fork_modulepath_args_options

  const childProcesses = [];
  const cpusNum = os.cpus().length;
  for (let i = 0; i < cpusNum; i++) {
    childProcesses.push(cp.fork('./child-process-fork.js'));

    // i
  }
  console.log(`Child Processes (${childProcesses.length}) was created!`);

  // n.on('message', (m) => {
  //   console.log('PARENT got message:', m);
  // });
  // n.send({ hello: 'world' });

  //fill em, first step (initial)
  for (let i = 0; i < sortedCacheServers.length; i++) {
    console.log(`Working with server ${i} of (${sortedCacheServers.length})`);

    let cacheServer = sortedCacheServers[i];

    const priorityEndpointsIds = getPriorityEndpointsIds(cacheServer.endpoints);

    for (let k = 0; k < cacheServer.endpoints.length; k++) {
      const endpoint = cacheServer.endpoints[k];
      let priorityVideosLength = getPriorityVideosLength(endpoint, videos);
      // console.log('priorityVideosLength', priorityVideosLength);

      // console.log('sortedCacheServers[i]', cacheServer);

      //loop through videos to check if one of them have to be added
      for (let j = 0; j < endpoint.videos.length; j++) {
        // console.log('serverRemainingCapacity', serverRemainingCapacity);
        const videoObj = endpoint.videos[j];

        //when to start sharding
        if (priorityVideosLength === 0) {
          break;
        }

        //fill by minimal latency only, requires second step
        // console.log('videoObj', videoObj); // with endpointId
        // if (videoObj.endpointId !== cacheServer.endpoints[0].endpointId) {
        if (priorityEndpointsIds.indexOf(videoObj.endpointId) < 0) {
          continue;
        }

        //only one video with best latency
        if (
          checkCapacity(videoObj.size, cacheServer.remainingCapacity) &&
          checkIfVideoIsIn(cacheServer.videoIds, videoObj.videoId)
        ) {
          cacheServer.remainingCapacity -= videoObj.size;
          cacheServer.videoIds.push(videoObj.videoId);
          priorityVideosLength--;
        }
      }
    }
  }

  //fill servers, second step (sharding), check if video was already added!
  sortedCacheServers = sharding(sortedCacheServers, videos);
  console.log('Servers sharded');

  // console.log(JSON.stringify(sortedCacheServers));
  // console.log(sortedCacheServers);

  // cleanup servers if no videos on it
  sortedCacheServers = sortedCacheServers.filter(server => server.videoIds.length);

  // console.log(sortedCacheServers);

  //kill all processes
  for (let i = 0; i < childProcesses.length; i++) {
    childProcesses[i].kill();
  }

  return sortedCacheServers;
};

/**
 * writeResults
 * @param  {String} data
 * @param  {String} fileName
 */
const writeResults = (data, fileName = '') => {
  fs.writeFile(`${fileName}.out.txt`, data, 'utf8', (err) => {
    if (err) {
      throw err;
    }
    console.log('Results were saved!');
  });
};
