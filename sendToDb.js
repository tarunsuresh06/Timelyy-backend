const csv = require("csvtojson");
const path = require("path");

const sendToDb = (data) => {
  const csvFilePath = path.join(__dirname, data);
  return csv()
    .fromFile(csvFilePath)
    .subscribe((json) => {
      return new Promise((resolve, reject) => {
        if (json) {
          resolve(json);
        } else {
          reject("Not OK");
        }
      });
    });
};

module.exports = sendToDb;
