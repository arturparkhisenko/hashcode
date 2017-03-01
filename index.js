const path = require('path');
const fs = require('fs');
const os = require('os');
const cp = require('child_process');

const test = false;

let files = test ? ['data-examples/example.in'] : [
  // 'data-examples/kittens.in',
  // 'data-examples/me_at_the_zoo.in',
  'data-examples/trending_today.in',
  'data-examples/videos_worth_spreading.in'
];

// V - videos E - endpoints R - requests C - cacheServers X - capacity
// example: 10000 1000 200000 500 6000
// s2 videos sizes
// s3 endpoint {latency, cacheServersNum}
// s4 videoStats {requests, id, endpointId}

// processes ------------------------------------------------------------------
// https://nodejs.org/dist/latest-v7.x/docs/api/child_process.html
// Usage: process.send({ funcName: 'x', args: [] });

const CPUs = os.cpus().length;
console.log(`OS cores (${CPUs})!`);
const connectProcess = (process) => {
  process.on('message', data => {
    // type: then/catch
    console.log('PARENT got data:', data);
  });
};

let childProcesses = [];
for (let i = 0; i < CPUs; i++) {
  const process = cp.fork('./child-process-fork.js');
  childProcesses.push(process);
  connectProcess(process);
}
console.log(`Child Processes (${childProcesses.length}) was created!`);

//TODO
// Promise.all([p1, p2, p3]).then(values => {
//   console.log(values); // [3, 1337, "foo"]
// });
//
// for (let proc of childProcesses) {
//   proc.send({
//     funcName: 'getServers',
//     args: [
//       1,2,3
//     ]
//   });
//   // getServers(X, splittedData, dataPartLength, videos)
// }

// processes-end --------------------------------------------------------------

let filesPromises = [];
for (const fileName of files) {
  filesPromises.push(processFile(fileName));
}

Promise.all(filesPromises).then(() => {
  // kill all processes
  for (let i = 0; i < childProcesses.length; i++) {
    childProcesses[i].kill();
  }
  console.log('Child Processes was killed!');
});

function processFile(fileName) {
  return new Promise((resolve, reject) => {
    fs.readFile(path.resolve(__dirname, fileName), 'utf8',
      /**
       * fs callback
       * @param  {Object} err
       * @param  {String} data
       */
      function(err, data) {
        if (err) {
          console.log(err);
          reject(err);
          // return console.log(err);
        }

        const timeLabel = `Time-for-${fileName}`;
        console.time(timeLabel);
        console.log(`Processing file: ${fileName}!`);

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
        dataArray.shift(); // to get data only
        dataArray.shift(); // to get data only
        // console.log(dataArray);

        const splittedData = dataSplitter(dataArray);
        console.log('Data splitted!');

        // sort videos by requests
        let videos = splittedData.videoStats.sort(
          (a, b) => b.requests - a.requests
        );

        let filledAndFilteredVideos = [];
        for (let i = 0, l = videos.length; i < l; i++) {
          let video = videos[i];
          // add video size
          video.size = parseInt(videoSizes[videos[i].videoId]);
          if (video.size > X) {
            // skip video with size bigger than X capacity
            continue;
          }
          filledAndFilteredVideos.push(video);
        }
        videos = filledAndFilteredVideos;
        // console.log(videos);

        const servers = getServers(X, splittedData, videos);

        console.log('Servers sorted / filtered / filled received!');
        const distribution = getCacheServersDistribution(servers, videos);
        console.log('Distribution finished!');
        const cacheServersNum = distribution.length;
        // console.log(distribution);

        let results = `${cacheServersNum}\n`;
        for (let i = 0; i < cacheServersNum; i++) {
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

        console.log('\nDistribution results:\n', results);
        writeResults(results, fileName);
        console.timeEnd(timeLabel);

        resolve();
      }
    );
  });
}

// const toFastProperties = (o) => {
//   function f() {}
//   f.prototype = o;
//   return new f;
// }

// check ----------------------------------------------------------------------

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

// check-end ------------------------------------------------------------------

// get ------------------------------------------------------------------------

const getExistingVideoId = (videos, videoId, endpointId) => {
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

const getVideosForEndpoint = (videos, endpointId) => {
  return videos.filter(value => value.endpointId === endpointId);
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

// get-end --------------------------------------------------------------------

// TODO requires parallel run
const dataSplitter = (data = []) => {
  let result = {
    endpoints: [],
    videoStats: []
  };
  let currentEndpointId = 0;
  for (let i = 0; i < data.length; i++) {
    const line = data[i].split(' ');
    if (line.length === 2) {
      //for latencies
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
    } else if (line.length === 3) {
      //for videos
      let video = {
        videoId: parseInt(line[0]),
        endpointId: parseInt(line[1]),
        requests: parseInt(line[2])
      };
      const existingVideoId = getExistingVideoId(result.videoStats, video.videoId, video.endpointId);
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

const sharding = (cacheServers, videos) => {
  //fill servers, second step (sharding), check if video was already added!
  let sortedCacheServers = Object.assign([], cacheServers);
  for (let i = 0, scsl = sortedCacheServers.length; i < scsl; i++) {
    let cacheServer = sortedCacheServers[i];
    // console.log({cacheServer, videos});
    for (let j = 0, vl = videos.length; j < vl; j++) {
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

const getPriorityVideosLength = (endpoint, videos) => {
  if (!videos || !videos.length) {
    return 0;
  }
  let videosLength = 1;
  let averageRequests = 0;
  let averageRequestsLength = 0;

  const filteredVideos = videos.filter(video => endpoint.endpointId === video.endpointId);

  for (let i = 0, l = filteredVideos.length; i < l; i++) {
    if (endpoint.endpointId === filteredVideos[i].endpointId) {
      averageRequests += filteredVideos[i].requests;
      averageRequestsLength++;
    }
  }
  averageRequests /= averageRequestsLength;
  // console.log({averageRequests, averageRequestsLength});

  for (let i = 1, l = filteredVideos.length; i < l; i++) {
    if (filteredVideos[i].requests <= averageRequests) {
      videosLength = i;
      break;
    }
  }

  return videosLength;
};

// TODO requires parallel run
const getServers = (X, splittedData, videos) => {
  //add latency to server
  let tempServers = [];
  for (let j = 0, l = splittedData.endpoints.length; j < l; j++) {
    console.log(`Servers filling with endpoint num ${j} of (${splittedData.endpoints.length})`);
    let latencies = splittedData.endpoints[j].latencies;
    // console.log(latencies);
    for (let i = 0, ll = latencies.length; i < ll; i++) {
      const numCacheServerId = latencies[i].cacheServerId;
      let tempServer = tempServers[numCacheServerId];
      if (typeof tempServer === 'undefined') {
        //create server with full data
        tempServers[numCacheServerId] = {
          midLatency: 0,
          endpoints: [],
          remainingCapacity: X,
          id: numCacheServerId,
          videoIds: []
        };
      }
      //count mid latency
      tempServers[numCacheServerId].midLatency += latencies[i].latencyToTheCacheServer;
      //add endpoints
      tempServers[numCacheServerId].endpoints.push({
        endpointId: j,
        latency: latencies[i].latencyToTheCacheServer,
        videos: getVideosForEndpoint(videos, j)
      });
    }
  }

  for (let i = 0, l = tempServers.length; i < l; i++) {
    let tempServer = tempServers[i];
    //set midLatency
    tempServer.midLatency /= tempServer.endpoints.length;
    // sort endpoints of each server by latency
    tempServer.endpoints.sort((a, b) => a.latency - b.latency);
    // console.log(tempServers);
    // console.log(`ID:${tempServer.id}`, tempServer);
  }

  // console.log(tempServers);
  // console.log(JSON.stringify(tempServers));

  console.log('Servers gathered with data!');

  //sort by min mid latency
  tempServers.sort((a, b) => a.midLatency - b.midLatency);
  // console.log(tempServers);

  console.log(`Servers (${tempServers.length}) sorted and filled with endpoints`);

  return tempServers;
};

// TODO requires parallel run
const getCacheServersDistribution = (sortedCacheServersIn, videos) => {
  let sortedCacheServers = Object.assign([], sortedCacheServersIn);

  //fill em, first step (initial)
  for (let i = 0; i < sortedCacheServers.length; i++) {
    console.log(`Working with server ${i} of (${sortedCacheServers.length})`);

    let cacheServer = sortedCacheServers[i];
    const priorityEndpointsIds = getPriorityEndpointsIds(cacheServer.endpoints);

    // if (i === 0) {
    //   let priorityVideosLength = getPriorityVideosLength(cacheServer.endpoints[0], videos);
    //   console.log('cacheServer',cacheServer);
    //   console.log('priorityEndpointsIds', priorityEndpointsIds);
    //   console.log('cacheServer.endpoints', cacheServer.endpoints);
    //   console.log('cacheServer.endpoints[0].videos', cacheServer.endpoints[0].videos);
    //   console.log('priorityVideosLength', priorityVideosLength);
    // }

    for (let k = 0; k < cacheServer.endpoints.length; k++) {
      const endpoint = cacheServer.endpoints[k];
      // let priorityVideosLength = getPriorityVideosLength(endpoint, videos);
      // console.log({cacheServer, priorityVideosLength});

      //loop through videos to check if one of them have to be added
      for (let j = 0; j < endpoint.videos.length; j++) {
        // console.log('serverRemainingCapacity', serverRemainingCapacity);
        const videoObj = endpoint.videos[j];

        //when to start sharding
        // if (priorityVideosLength === 0) {
        //   break;
        // }

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
          // priorityVideosLength--;
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
