const path = require('path');
const fs = require('fs');
const zip = require('./zip.js');

const test = process.env.NODE_ENV !== 'production';

const files = test
  ? ['data-examples/c_no_hurry.in']
  : [
      'data-examples/a_example.in',
      'data-examples/b_should_be_easy.in',
      'data-examples/c_no_hurry.in',
      'data-examples/d_metropolis.in',
      'data-examples/e_high_bonus.in'
    ];

let filesPromises = [];
for (const fileName of files) {
  filesPromises.push(processFile(fileName));
}

Promise.all(filesPromises).then(() => {
  zip();
  console.log('Code was Zipped as /data-examples/code.zip!');
});

// --------------------------------------
let time;

/**
 * writeResults
 * @param  {string} [data='']
 * @param  {string} [fileName='']
 */
const writeResults = (data = '', fileName = '') => {
  fs.writeFileSync(`${fileName}.out.txt`, data, 'utf8');
  console.log(`Results for the "${fileName}" were saved!`);
};

function processFile(fileName) {
  return new Promise((resolve, reject) => {
    fs.readFile(
      path.resolve(__dirname, fileName),
      'utf8',
      /**
       * fs callback
       * @param  {Object} err
       * @param  {string} data
       */
      (err, data) => {
        if (err) {
          console.log(err);
          reject(err);
        }

        const timeLabel = `Time spent on ${fileName}`;
        console.time(timeLabel);
        console.log(`Processing file: ${fileName}!\n`);

        let dataArray = data.split('\n');
        if (dataArray[dataArray.length - 1] === '') {
          dataArray.pop(); // trim trailing whitespace
        }
        const firstLine = dataArray[0].split(' ');
        // const R = parseInt(firstLine[0]);
        // const C = parseInt(firstLine[1]);
        const F = parseInt(firstLine[2]);
        // const N = parseInt(firstLine[3]);
        // const B = parseInt(firstLine[4]);
        const T = parseInt(firstLine[5]);
        time = T;

        dataArray.shift(); // to get data only

        const schedule = new Array(F).fill([]); //vehicles
        let ridesOriginal = parse(dataArray);
        let ridesSorted = sortByF(ridesOriginal);
        let rides = ridesSorted.slice();
        // console.log('rides', rides, '\n');

        for (let i = 0; i < schedule.length; i++) {
          if (rides.length === 0) { continue; }
          const foundRides = findByLatest(rides, ridesOriginal);
          schedule[i] = foundRides;
          // console.log(rides.length, foundRides.length)
          // console.log('@', {foundRides});
          rides = rides.filter(item =>
            foundRides.indexOf(item.i) === -1
          );
          // console.log(rides.length, '\n')

          // console.log(
          //   'Car Rides: Found', foundRides,
          //   '.length', foundRides.length,
          //   'Left', rides.length
          // );
        }

        console.log('Rides left', rides[0]);
        console.log('Rides left', rides.length);

        // console.log('\nschedule', schedule);

        let results = '';
        schedule.forEach(result => {
          results +=
            result.length.toString() + ' ' +
            (result.join` `).trim() + '\n';
        });

        // output example:
        // 1 0 - this vehicle is assigned 1 ride: [0]
        // 2 2 1 - this vehicle is assigned 2 rides: [2, 1]
        // console.log('\nResults:\n', results);
        writeResults(results, fileName);
        console.timeEnd(timeLabel);

        resolve();
      }
    );
  });
}

// --------------------------------------

const parse = data => {
  let results = [];
  for (let i = 0; i < data.length; i++) {
    const rideArr = data[i].split(' ');
    const ride = {
      a: parseInt(rideArr[0]),
      b: parseInt(rideArr[1]),
      x: parseInt(rideArr[2]),
      y: parseInt(rideArr[3]),
      s: parseInt(rideArr[4]),
      f: parseInt(rideArr[5]),
      i,
    };
    ride.d = Math.abs(ride.x - ride.a) + Math.abs(ride.y - ride.b);
    results.push(ride);
  }
  return results;
};

const sortByF = rides => rides.sort((a, b) => a.f - b.f);

//homes.sort(fieldSorter(['city', '-price']));
// homes.sort(fieldSorter(['zip', '-state', 'price'])); // alternative

function dynamicSort(property) {
    return function (obj1,obj2) {
        return obj1[property] > obj2[property] ? 1
            : obj1[property] < obj2[property] ? -1 : 0;
    }
}

function dynamicSortMultiple() { // eslint-disable-line
    /*
     * save the arguments object as it will be overwritten
     * note that arguments object is an array-like object
     * consisting of the names of the properties to sort by
     */
    var props = arguments;
    return function (obj1, obj2) {
        var i = 0, result = 0, numberOfProperties = props.length;
        /* try getting a different result from 0 (equal)
         * as long as we have extra properties to compare
         */
        while(result === 0 && i < numberOfProperties) {
            result = dynamicSort(props[i])(obj1, obj2);
            i++;
        }
        return result;
    }
}

const findByLatest = (rides, ridesOriginal) => {
  let latestRide = rides[rides.length-1];
  let result = [latestRide.i];
  let skipi = [rides[rides.length-1].i]; // skip first

  let searchActive = true;

  while (searchActive) {
    let nextRide = null;

    // console.log('\nlatestRide', latestRide);

    // TODO: optimize here
    // const ridesSorted = rides.splice().sort((a,b)=> b.d - a.d );
    // const ridesSorted = rides.splice().sort(dynamicSortMultiple('a', 'b', 'x', 'y'));

    // const ridesSorted = rides.splice().sort((a,b) => {
    //   if (a.x < b.x && a.y < b.y)
    //     return -1;
    //   if (a.x > b.x && a.y > b.y)
    //     return 1;
    //   if (a.a < b.a && a.b < b.b)
    //     return -1;
    //   if (a.a > b.a && a.b > b.b)
    //     return 1;
    //   return 0;
    // });

    rides.forEach(item => {
    // ridesSorted.forEach(item => {
      // const prevRideTime = latestRide.f - latestRide.d;
      // const nextRideTime = item.f - item.d;
      const prevRideTime = latestRide.s - latestRide.d;
      const nextRideTime = item.s - item.d;
      if (prevRideTime - nextRideTime > 0) {
        // console.log('found a ride');
        nextRide = item;
      }
    });

    if (!nextRide) {
      searchActive = false;
      continue;
    }

    // console.log({result, rides});
    const distance = result.reduce((acc, item) => acc + ridesOriginal[item].d, 0);
    // console.log({result, distance});

    const exitNoTime = (time - distance - nextRide.d) < 0;
    if (exitNoTime) {
      // console.log('Car filled with rides');
      searchActive = false;
      continue;
    }

    if (nextRide) {
      const exitWasUsed = skipi.indexOf(nextRide.i) !== -1;
      if (exitWasUsed) {
        // console.log('exitWasUsed');
        searchActive = false;
        continue;
      }
      // console.log('==> Car Push a ride i', nextRide.i);
      skipi.push(nextRide.i);
      result.unshift(nextRide.i);
      latestRide = nextRide;
    }
  }

  return result;
}
