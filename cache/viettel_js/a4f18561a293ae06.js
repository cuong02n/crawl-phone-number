document.addEventListener('DOMContentLoaded', function() {
  initTracking();
}, false);

var initTracking = function () {
  var buttonTracking = document.querySelectorAll(".interaction");
  for (var i = 0; i < buttonTracking.length; ++i) {
    var curItem = buttonTracking.item(i);
    curItem.addEventListener("click", function (ev) {
      var params = {
        "et": this.getAttribute('data-e-type'),
        "dt": this.getAttribute('data-e-title'),
        "ec": this.getAttribute('data-e-code'),
      };

      eventLog(params);
    });
  }
};

function eventLog(params) {
  var defaultParams = {
    "dt": document.title,
    "dp": window.location.pathname
  };
  params = Object.assign(defaultParams, params);

  var serialisedGetParams = [];
  for (var param in params) {
    if ( ! params.hasOwnProperty(param)) {
      continue;
    }
    serialisedGetParams.push(param + '=' + encodeURIComponent(params[param]));
  }
  // debugger
  serialisedGetParams = serialisedGetParams.join('&');
  (new Image).src = '/vtw.php?' + serialisedGetParams;
}