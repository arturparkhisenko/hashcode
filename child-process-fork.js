// api callbacks types: then, catch
// api public { funcName: 'x', args: [] }
process.on('message', (m) => {
  console.log('CHILD got message:', m);
  switch (m.funcName) {
    case 'getServers':
      process.send({
        type: 'then',
        funcName: m.funcName,
        data: getServers(...m.args)
      });
      break;
    case '':
      break;
  }
});

const getVideosForEndpoint = (videos, endpointId) => {
  return videos.filter(value => value.endpointId === endpointId);
};

function getServers(X, splittedData, dataPartLength, videos) {

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
}
