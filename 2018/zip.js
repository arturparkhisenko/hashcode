const archiver = require('archiver');
const fs = require('fs');

module.exports = () => {
  fs.unlink(__dirname + '/data-examples/code.zip', () => {});

  // create a file to stream archive data to.
  const output = fs.createWriteStream(__dirname + '/data-examples/code.zip');
  const archive = archiver('zip', {
    store: true // Sets the compression method to STORE.
  });

  // pipe archive data to the file
  archive.pipe(output);

  // append a files from stream
  archive.append(fs.createReadStream(__dirname + '/index.js'), {
    name: 'index.js'
  });
  archive.append(fs.createReadStream(__dirname + '/zip.js'), {
    name: 'zip.js'
  });
  archive.append(fs.createReadStream(__dirname + '/package.json'), {
    name: 'package.json'
  });

  // finalize the archive (ie we are done appending files but streams have to finish yet)
  archive.finalize();
};
