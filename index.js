const path = require('path');
const fs = require('fs');
// const os = require('os');
// const cp = require('child_process');

const test = false;

let files = test ? ['data-examples/example.in'] : [
  // 'data-examples/kittens.in',
  'data-examples/me_at_the_zoo.in',
  // 'data-examples/trending_today.in',
  // 'data-examples/videos_worth_spreading.in'
];

// V - videos E - endpoints R - requests C - cacheServers X - capacity
// example: 10000 1000 200000 500 6000
// s2 videos sizes
// s3 endpoint {latency, cacheServersNum}
// s4 videoStats {requests, id, endpointId}

// processes ------------------------------------------------------------------
// https://nodejs.org/dist/latest-v7.x/docs/api/child_process.html
// Usage: process.send({ funcName: 'x', args: [] });

// const CPUs = os.cpus().length;
// console.log(`OS cores (${CPUs})!`);
// const connectProcess = (process) => {
//   process.on('message', data => {
//     // type: then/catch
//     console.log('PARENT got data:', data);
//   });
// };
//
// let childProcesses = [];
// for (let i = 0; i < CPUs; i++) {
//   const process = cp.fork('./child-process-fork.js');
//   childProcesses.push(process);
//   connectProcess(process);
// }
// console.log(`Child Processes (${childProcesses.length}) was created!`);

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

// Promise.all(filesPromises).then(() => {
//   // kill all processes
//   for (let i = 0; i < childProcesses.length; i++) {
//     childProcesses[i].kill();
//   }
//   console.log('Child Processes was killed!');
// });

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
        // console.log(splittedData.endpoints);

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

        const distribution = getServers(X, splittedData, videos);
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

const checkIfVideoIsIn = (arrayOfVideos, videoId) => arrayOfVideos.indexOf(videoId) >= 0;

const checkIfObjWithIdFoundInArr = (arr, id, key) => {
  let result = -1;
  for (let i = 0, l = arr.length; i < l; i++) {
    if (arr[i][key] === id) {
      result = i;
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

// get-end --------------------------------------------------------------------

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

const getServers = (X, splittedData, videos) => {
  //add latency to server
  let tempServers = [];

  // req * saved ms / video requests summ
  //  #3 900        #4 0
  // (1500 * 900 + 500 * 0 + 1000 * 800 + 1000 * 900)/(1500 + 500 + 1000 + 1000) = 762.5

  //TODO loop through endpoints primary

  for (let i = 0, l = videos.length; i < l; i++) {
    console.log(`Current video: (${i}) of (${l - 1})`);

    const video = videos[i];
    const endpoint = splittedData.endpoints[video.endpointId];
    // sort servers by latency
    const servers = endpoint.latencies.sort((a, b) => {
      return a.latencyToTheCacheServer - b.latencyToTheCacheServer;
    });

    let videoWasAdded = false;

    //loop through servers to find a space for a video
    for (let j = 0, ll = servers.length; j < ll; j++) {
      if (videoWasAdded) {
        break;
      }

      let serverId = servers[j].cacheServerId;
      //find server
      const serverIndex = checkIfObjWithIdFoundInArr(tempServers, serverId, 'id');

      if (serverIndex < 0) {
        //create server and fill it with defaults
        tempServers.push({
          maxRequests: video.requests,
          remainingCapacity: X - video.size,
          id: serverId,
          videoIds: [video.videoId]
        });
        videoWasAdded = true;
      } else {
        //fill
        let server = tempServers[serverIndex];
        const duplicate = checkIfVideoIsIn(server.videoIds, video.videoId);
        if (duplicate) {
          break;
        }
        const enoughSpace = checkCapacity(video.size + 1, server.remainingCapacity);
        if (!enoughSpace) {
          continue;
        }

        server.maxRequests += video.requests;
        server.remainingCapacity -= video.size;
        server.videoIds.push(video.videoId);

        // if (server.id === 0) {
        //   console.log(`videoID ### ${video.videoId} size ${video.size}, serverId ${serverId}, remainingCapacity ${server.remainingCapacity}, enoughSpace ${enoughSpace}`);
        //   console.log(`server ${JSON.stringify(server)}`);
        // }

        videoWasAdded = true;
      }
    }
  }

  // console.log({tempServers});
  // console.log(JSON.stringify(tempServers));

  console.log('Servers gathered with data!');

  // TODO sort servers by all requests
  tempServers.sort((a, b) => b.maxRequests - a.maxRequests);
  // console.log({tempServers});

  console.log(`Servers (${tempServers.length}) sorted and filled with endpoints`);

  return tempServers;
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
