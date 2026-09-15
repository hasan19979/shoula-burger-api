// بيلف أي route async حتى لو صار خطأ جواه، ينمرر تلقائياً للـ error handler
// بدل ما يعلّق السيرفر أو يحتاج try/catch مكرر بكل مكان
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
