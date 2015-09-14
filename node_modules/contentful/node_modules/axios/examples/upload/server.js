module.exports = function (req, res) {
  var data = '';

  req.on('data', function (chunk) {
    data += chunk;
  });

  req.on('end', function () {
    console.log(data);
  });
};
