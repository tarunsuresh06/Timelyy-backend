const csv = require("csvtojson");
const path = require("path");

const sendToDb = () => {
  const csvFilePath = path.join(__dirname, "subject_data.csv");
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
