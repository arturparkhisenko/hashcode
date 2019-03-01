const fs = require('fs');
const path = require('path');
const zip = require('./zip.js');

const test = process.env.NODE_ENV !== 'production';

const files = test
  ? ['data-examples/a_example.txt']
  : [
      'data-examples/a_example.txt',
      'data-examples/b_lovely_landscapes.txt',
      'data-examples/c_memorable_moments.txt',
      'data-examples/d_pet_pictures.txt',
      'data-examples/e_shiny_selfies.txt'
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

        const firstLine = dataArray[0];
        const photosLength = Number(firstLine);

        dataArray.shift(); // to get data only

        let photos = parsePhotos(dataArray);
        console.log('photosLength', photosLength, 'photos', photos);

        // slide: {getPhotos():[photo1, photo2], getTags(): [tag1, tag2], hasSpace(): getPhotos().length < 2}

        // 1. make a V+V slides first findHighestInterestFactorPair
        // 2. now when we have all slides, we need to find a chain with highest interest
        // 3. we can try to do it one by one, filling one max pair after another by
        // searching a max pair for the last element in chain
        // 4. Find a score for the album by counting all slides interest factor summation.

        let results = '';
        // schedule.forEach(result => {
        //   results +=
        //     result.length.toString() + ' ' + result.join` `.trim() + '\n';
        // });

        // output example:
        // 3 - The slideshow has 3 slides
        // 0 - First slide contains photo 0
        // 1 2 - Second slide contains photos 1 and 2
        // console.log('\nResults:\n', results);
        writeResults(results, fileName);
        console.timeEnd(timeLabel);

        resolve();
      }
    );
  });
}

// --------------------------------------

function parsePhotos(data) {
  let i, line, photo;
  let length = data.length;
  let result = [];
  for (i = 0; i < length; i++) {
    line = data[i].split(' ');
    photo = {
      orientation: line.shift(),
      tagsLength: Number(line.shift()),
      tags: line,
      i
    };
    result.push(photo);
  }
  return result;
}

/**
 * For two subsequent slides Si and Si+1,
 * the interest factor is the minimum (the smallest number of the three) of:
 * ● the number of common tags between Si and Si+1
 * ● the number of tags in Si but not in Si+1
 * ● the number of tags in Si+1 but not in Si.
 *
 * @param {*} data
 * @returns {Array} pair
 */
function findHighestInterestFactorPair(data) {
  return { pair: [{}, {}], interestFactor: Math.min(0)};
}
