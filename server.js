var WebSocketServer = require('ws').Server
  , http = require('http')
  , express = require('express')
  , _ = require('underscore')
  , app = express()
  , port = process.env.PORT || 5000
  , game = require('./game');

app.use(express.static(__dirname + '/public/'));

var server = http.createServer(app);
server.listen(port);
console.log('http server listening on %d', port);

var wss = new WebSocketServer({server: server});

var playerCounter = 0;
var defaultMaxPlayers = 2;
var defaultGameSize = 70;
var games = [];

var findGame = function() {
	for (var i = 0; i < games.length; i++) {
		var thisGame = games[i];
		if (thisGame.players.length < thisGame.maxPlayers) {
			return thisGame;
		}
	}
	return null;
};

wss.on('connection', function(ws) {

	var player = new game.Player(playerCounter);
	playerCounter += 1;

	var thisGame = findGame();
	if (thisGame === null) {
		thisGame = new game.Game(defaultMaxPlayers, defaultGameSize);
		games.push(thisGame);
	}

	thisGame.join(ws, player);
	thisGame.maybeStart();

	ws.on('message', function(data, flags) {
		thisGame.receive(player, JSON.parse(data));
	});

    ws.on('close', function() {
		console.log('closed');
		thisGame.closeSocket(ws);
    });

});
