const fs = require('fs');
const path = require('path');

let files = ['example.in'];

const full = true;

if (full) {
  files.push(
    'data-examples/kittens.in',
    'data-examples/me_at_the_zoo.in',
    'data-examples/trending_today.in',
    'data-examples/videos_worth_spreading.in'
  )
}

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

for (fileName of files) {
  processFile(fileName);
}

function processFile() {
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
      // console.log('videos sorted');
      // console.log(videos);

      // delete video with size bigger than X capacity
      videos = videos.filter(el => videoSizes[el.videoId] < X);
      // console.log('videos filtered');
      // console.log(videos);

      const servers = getCacheServersDistribution(V, E, R, C, X,
        videoSizes, splittedData, videos);
      const cacheServersNum = servers.length;

      let results = `${cacheServersNum}\n`;

      // console.log(servers);

      for (var i = 0; i < servers.length; i++) {
        results += `${servers[i].id}`;
        for (var j = 0; j < servers[i].videoIds.length; j++) {
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
  for (var i = index; i < index + num; i++) {
    const cacheServerStats = data[i].split(' ');
    result.push({
      cacheServerId: parseInt(cacheServerStats[0]),
      latencyToTheCacheServer: parseInt(cacheServerStats[1])
    });
  }
  return result;
};

/**
 * getCacheServersDistribution
 * @param  {Number} indexR
 * @param  {Array} matrix
 * @return {String} results
 */
const getCacheServersDistribution = (V, E, R, C, X, videoSizes, splittedData, videos) => {
  // add latency to server
  let tempServers = {};
  for (let j = 0; j < splittedData.endpoints.length; j++) {
    let latencies = splittedData.endpoints[j].latencies;
    // console.log(latencies);
    for (let i = 0; i < latencies.length; i++) {
      if (!tempServers[latencies[i].cacheServerId] ||
        !latencies[i].cacheServerId.latency) {
        tempServers[latencies[i].cacheServerId] = {
          latency: 0
        };
      }
      tempServers[latencies[i].cacheServerId].latency += latencies[i].latencyToTheCacheServer;

      // endpointId
      tempServers[latencies[i].cacheServerId].endpointId = j;
    }
    for (let i = 0; i < latencies.length; i++) {
      tempServers[latencies[i].cacheServerId].latency = tempServers[latencies[i].cacheServerId].latency / latencies.length;
    }
  }
  // console.log(tempServers);

  // sort by min latency
  let sortedCacheServers = [];
  for (var server in tempServers) {
    if (tempServers.hasOwnProperty(server)) {
      // console.log(tempServers);
      sortedCacheServers.push({
        id: parseInt(server),
        latency: parseInt(tempServers[server + ''].latency),
        endpointId: tempServers[server + ''].endpointId,
        videoIds: []
      });
    }
  }
  sortedCacheServers.sort((a, b) => a.latency - b.latency);
  // console.log(sortedCacheServers);

  let usedIds = [];
  for (var i = 0; i < sortedCacheServers.length; i++) {
    // videos
    // videoSizes[videos[i].videoId]
    let serverRemainingCapacity = X;
    for (let j = 0; j < videos.length; j++) {
      // console.log('serverRemainingCapacity');
      // console.log(serverRemainingCapacity);
      // console.log(sortedCacheServers[i]);
      const videoSize = parseInt(videoSizes[videos[j].videoId]);
      const videoObj = videos[j];
      if (videoSize <= serverRemainingCapacity &&
        usedIds.indexOf(videoObj.videoId) < 0
        // && videoObj.endpointId === sortedCacheServers[i].endpointId
      ) {
        serverRemainingCapacity -= videoSize;
        usedIds.push(videoObj.videoId);
        sortedCacheServers[i].videoIds.push(videoObj.videoId);
      }
    }
  }

  // console.log(JSON.stringify(sortedCacheServers));
  // console.log(sortedCacheServers);

  // clearup servers
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
