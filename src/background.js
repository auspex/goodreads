// This is run in the backgrond 

// default settings (deprecated but left in for migration of older versions)
var settings = new Store("settings");

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  switch (message.type) {
    case 'FROM_GROD_PAGE':
      // load strings for different libraries
      chrome.storage.sync.get("libraries", function(obj) {
        libraries = obj["libraries"];
        for (var l in libraries) {
          // just get the library name
          library = libraries[l].replace(/\..*/, '');
          // create a library name to display
          if (Object.keys(libraries).length == 1) {
            libraryStr = "";
          } else {
            libraryStr = library + ": ";
          }
          // create search url
          searchTerm = message.title + " " + message.author
          url = "http://" + libraries[l] + "/BANGSearch.dll?Type=FullText&FullTextField=All&FullTextCriteria=" + encodeURIComponent(searchTerm);
          $.ajax({
            url: url,
            success: parseODResults(message.id, library, libraryStr, searchTerm, url, sender.tab.id),
            error: function(request, status, error) {
              chrome.tabs.sendMessage(sender.tab.id, {
                type: 'FROM_GROD_EXTENSION' + message.id,
                error: error
              });
            }
          });
        }
      });
      break;
    case 'FROM_ODLIB_PAGE':
      $.ajax({
        url: "http://api.statdns.com/" + message.libraryLink + "/cname",
        success: parseDNSResults(message.libraryName, sender.tab.id),
        error: function(request, status, error) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'FROM_GROD_EXTENSION' + message.id,
            error: error
          });
        }
      });
      break;
  }
});
// when installed for the first time, show the options page first
chrome.runtime.onInstalled.addListener(
  function(details) {
    if (details.reason == "install") {
      chrome.tabs.create({
        url: "src/options/index.html"
      });
    } else if (details.reason == "update") {
      // if an older version, migrate to newer settings
      if (details.previousVersion.localeCompare("1.1.3") == 0) {
        libraries = {};
        for (var l in settings.get('librarydomains')) {
          libraries[settings.get('librarydomains')[l].replace(/\..*/, '')] = settings.get('librarydomains')[l];
        }
        chrome.storage.sync.set({
          libraries: libraries
        }, function() {
          chrome.tabs.create({
            url: "src/options/index.html"
          });
        });
      }
    }
  }
);

var Book = function(title, copies, total, waiting, isaudio, url, library) {
  this.title = title;
  this.copies = copies;
  this.total = total;
  this.waiting = waiting;
  this.isaudio = isaudio;
  this.url = url;
  this.library = library;
}

// parse the Overdrive results page
function parseODResults(id, library, libraryStr, searchTerm, url, tabid) {
  return function(data, textStatus, jqXHR) {
    copies = -1;
    total = -1;
    waiting = -1;
    isaudio = false;
    books = [];
    // if no results found
    if (data.indexOf("No results were found for your search.") > 0) {

    } else { // if results found
      // iterate over each result
      $("div.img-and-info-contain", data).each(function(index, value) {
        // get the title
        title = $(this).find("span.i-hide").filter(function() {
          return $(this).text().indexOf("Options for") >= 0;
        }).text().replace(/^Options for /, "");
        // get stats on the book
        copies = $(this).attr("data-copiesavail");
        total = $(this).attr("data-copiestotal");
        waiting = $(this).attr("data-numwaiting");

        // if the icon is an audiobook, then set flag accordingly
        icon = $(this).find("span.tcc-icon-span").attr("data-iconformat");
        if (icon && icon.indexOf("Audiobook") >= 0) {
          isaudio = true;
        } else {
          isaudio = false;
        }
        // add this book to the list to return
        books.push(new Book(title, copies, total, waiting, isaudio, url, library));
      })
    }
    // send the book results list back to the tab
    chrome.tabs.sendMessage(tabid, {
      type: 'FROM_GROD_EXTENSION' + id,
      id: id,
      library: library,
      libraryStr: libraryStr,
      searchTerm: searchTerm,
      url: url,
      books: books
    });
  }
}

// parse the DNS results page
function parseDNSResults(libraryName, tabid) {
  return function(data, textStatus, jqXHR) {
    if (data && data.hasOwnProperty("answer") && data.answer.length > 0 && data.answer[0].hasOwnProperty("rdata")) {
      libraryLink = data.answer[0].rdata.replace(/^https?:\/\//, '').replace(/overdrive.com.*/, 'overdrive.com');

    } else {
      libraryName = "NOTFOUND";
      libraryLink = "NOTFOUND";
    }
    // send the dns results list back to the tab
    chrome.tabs.sendMessage(tabid, {
      type: 'FROM_GROD_EXTENSION',
      libraryName: libraryName,
      libraryLink: libraryLink
    });
  }
}