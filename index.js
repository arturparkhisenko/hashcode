const fs = require('fs');
const path = require('path');

const test = false;

let files = test ? ['data-examples/example.in'] : [
  // 'data-examples/kittens.in',
  // 'data-examples/me_at_the_zoo.in',
  'data-examples/trending_today.in',
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

for (const fileName of files) {
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
      let dataArray = data.split('\n');
      if (dataArray[dataArray.length - 1] === '') {
        dataArray.pop(); // trim trailing whitespace
      }
      // console.log(dataArray);
      const firstLine = dataArray[0].split(' ');
      const V = parseInt(firstLine[0]);
      const E = parseInt(firstLine[1]);
      const R = parseInt(firstLine[2]);
      const C = parseInt(firstLine[3]);
      const X = parseInt(firstLine[4]);
      // console.log({
      //   V,
      //   E,
      //   R,
      //   C,
      //   X
      // });

      const videoSizes = dataArray[1].split(' ');
      // console.log(videoStats);

      dataArray.shift();
      dataArray.shift(); // to get data only
      // console.log(dataArray);

      const splittedData = dataSplitter(dataArray);

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
      // console.log('videos sorted and filtered');
      // console.log(videos);

      const servers = getCacheServersDistribution(V, E, R, C, X,
        videoSizes, splittedData, videos);
      const cacheServersNum = servers.length;

      let results = `${cacheServersNum}\n`;

      // console.log(servers);

      for (let i = 0; i < servers.length; i++) {
        results += `${servers[i].id}`;
        for (let j = 0; j < servers[i].videoIds.length; j++) {
          results += ` ${servers[i].videoIds[j]}`;
        }
        results += `\n`;
      }

      // example: output to file
      // 3 - how much cache servers
      // serverId videoId videoId
      // 0        2       3

      console.log(results);
      writeResults(results, fileName);
    }
  );
}

const dataSplitter = (inputData = []) => {
  let result = {
    endpoints: [],
    videoStats: []
  };
  let data = Object.assign([], inputData);
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
      result.videoStats.push(video);
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
const checkIfVideoIsUsed = (usedIds, videoId) => usedIds.indexOf(videoId) < 0;

const checkIfEndpointFound = (endpoints, videoId) => {
  let result = false;
  for (let i = 0; i < endpoints.length; i++) {
    if (endpoints[i].endpointId === videoId) {
      result = true;
      break;
    }
  }
  return result;
};

const sharding = (cacheServersIn, videos) => {
  let cacheServers = Object.assign([], cacheServersIn);
  //fill servers, second step (sharding), check if video was already added!
  let sortedCacheServers = Object.assign([], cacheServers);
  for (let i = 0; i < sortedCacheServers.length; i++) {
    let cacheServer = sortedCacheServers[i];
    // console.log('cache serv: ', cacheServer);
    // console.log('videos: ', videos);
    for (let j = 0; j < videos.length; j++) {
      const videoObj = videos[j];
      // console.log('videosObj: ', videoObj); // with endpointId
      if (
        checkIfEndpointFound(cacheServer.endpoints, videoObj.endpointId) &&
        checkCapacity(videoObj.size, cacheServer.remainingCapacity) &&
        cacheServer.videoIds.indexOf(videoObj.videoId) < 0
      ) {
        cacheServer.remainingCapacity -= videoObj.size;
        cacheServer.videoIds.push(videoObj.videoId);
      }
    }
  }
  return sortedCacheServers;
};

const getCacheServersDistribution = (V, E, R, C, X,
  videoSizes, splittedData, videos) => {
  // add latency to server
  let tempServers = {};
  for (let j = 0; j < splittedData.endpoints.length; j++) {
    let latencies = Object.assign([], splittedData.endpoints[j].latencies);
    // console.log(latencies);
    for (let i = 0; i < latencies.length; i++) {
      if (!tempServers[latencies[i].cacheServerId]) {
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
        latency: latencies[i].latencyToTheCacheServer
      });
    }
    for (let i = 0; i < latencies.length; i++) {
      tempServers[latencies[i].cacheServerId].midLatency = tempServers[latencies[i].cacheServerId].midLatency / latencies.length;
    }
  }

  // console.log(tempServers);

  // sort by min mid latency
  let sortedCacheServers = [];
  for (let server in tempServers) {
    if (tempServers.hasOwnProperty(server)) {
      // console.log(tempServers);
      sortedCacheServers.push({
        remainingCapacity: X,
        id: parseInt(server),
        midLatency: parseInt(tempServers[server + ''].midLatency),
        endpoints: tempServers[server + ''].endpoints,
        videoIds: []
      });
    }
  }
  sortedCacheServers.sort((a, b) => a.midLatency - b.midLatency);
  // console.log(sortedCacheServers);

  // sort endpoints of each server by latency
  for (let i = 0; i < sortedCacheServers.length; i++) {
    sortedCacheServers[i].endpoints.sort((a, b) => a.latency - b.latency);
  }
  // console.log(sortedCacheServers);

  //fill em, first step (initial)
  let usedIds = [];
  for (let i = 0; i < sortedCacheServers.length; i++) {
    let serverObj = sortedCacheServers[i];
    // console.log('sortedCacheServers[i]', serverObj);

    //loop through videos to check if one of them have to be added
    for (let j = 0; j < videos.length; j++) {
      // console.log('serverRemainingCapacity', serverRemainingCapacity);
      const videoObj = videos[j];

      //fill by minimal latency only, requires second step
      // console.log('videos[j]', videos[j]); // with endpointId
      if (videoObj.endpointId !== serverObj.endpoints[0].endpointId) {
        continue;
      }

      //only one video with best latency
      if (
        checkCapacity(videoObj.size, serverObj.remainingCapacity) &&
        checkIfVideoIsUsed(usedIds, videoObj.videoId)
      ) {
        serverObj.remainingCapacity -= videoObj.size;
        usedIds.push(videoObj.videoId);
        serverObj.videoIds.push(videoObj.videoId);
        // TODO use a found priority % when to start sharding
        break;
      }
    }
  }

  //fill servers, second step (sharding), check if video was already added!
  sortedCacheServers = sharding(sortedCacheServers, videos);

  // console.log(JSON.stringify(sortedCacheServers));
  // console.log(sortedCacheServers);

  // clearup servers if no videos on it
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
