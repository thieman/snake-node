var _ = require('underscore');

var addArrays = function(a, b) {
	var result = [];
	for (var i = 0; i < Math.min(a.length, b.length); i++) {
		result.push(a[i] + b[i]);
	}
	return result;
};

var Game = function(maxPlayers, size) {

	this.maxPlayers = maxPlayers;
	this.grid = new Grid(size, size);
	this.tickCounter = 0;
	this.tickIntervalMs = 50;

	this.players = [];
	this.sockets = [];
	this.actions = [];
	this.responses = [];

	this.addPlayer = function(player) {
		this.players.push(player);
		this.grid.addSnake(player);
	};

	this.join = function(ws, player) {
		this.sockets.push(ws);
		this.addPlayer(player);
	};

	this.maybeStart = function() {
		if (this.maxPlayers === this.players.length) {
			this.grid.addFood();
			this.broadcastState();
		}
	};

	this.receive = function(player, clientData) {
		this.actions.push({player: player, data: clientData});
		this.maybeTick();
	};

	this.maybeTick = function() {
		if (this.actions.length === this.players.length) {
			this.tick();
			this.actions = [];
			this.scheduleBroadcast();
		}
	};

	this.tick = function() {

		_.each(this.actions, function(action) {
			_.each(this.grid.snakes, function(snake) {
				if (snake.player === action.player) {
					if (action.data.direction !== null) {
						snake.direction = action.data.direction;
					}
				}
			});
		}, this);

		var fedSnakes = [];
		var eatenFood = [];

		_.each(this.grid.snakes, function(snake) { snake.grow(); });

		_.each(this.grid.snakes, function(snake) {

			var collisions = snake.headCollision();
			if (_.some(collisions, function(x) { return (x.deadly === true); })) {
				this.responses.push({type: 'gameOver'});
			}

			_.each(collisions, function(collision) {
				if (collision.collideType === 'food') {
					fedSnakes.push(this);
					eatenFood.push(collision);
				}
			}, snake);

			_.each(eatenFood, function(eaten) {
				this.grid.foods = _.without(this.grid.foods, eaten);
				console.log(this.grid.foods);
				this.grid.addFood();
			}, this);

		}, this);

		_.each(_.difference(this.grid.snakes, fedSnakes), function(snake) { snake.shrink(); });

		this.tickCounter += 1;
	};

	this.scheduleBroadcast = function() {
		var wait = this.tickIntervalMs - ((new Date()) - this.lastBroadcast);
		if (wait <= 0) {
			this.broadcastState();
		} else {
			var that = this;
			setTimeout(function() { that.broadcastState(); }, wait);
		}
	};

	this.closeSocket = function(ws) {
		this.sockets = _.without(this.sockets, ws);
	};

	this.broadcastState = function() {
		var data = {tick: this.tickCounter,
					grid: this.grid,
					responses: this.responses};
		var removeParents = function(k, v) { return (k === 'parent') ? undefined : v; };
		this.lastBroadcast = new Date();
		_.each(this.sockets, function(ws) {
			ws.send(JSON.stringify(data, removeParents));
		}, this);
		this.responses = [];
	};

};

var Player = function(id) {
	this.id = id;
	this.color = _.sample(['blue', 'green', 'purple', 'orange', 'pink', 'green', 'skyblue']);
};

var GridBox = function(row, col) {

	this.row = row;
	this.col = col;
	this.collideable = false;
	this.color = 'white';

	this.setCollideable = function() {
		this.collideable = true;
		this.collideType = 'edge';
		this.deadly = true;
		this.color = 'black';
	};
};

var Grid = function(rows, cols) {
	this.rows = rows;
	this.cols = cols;
	this.grid = [];
	this.snakes = [];
	this.foods = [];

	_.each(_.range(rows), function(row, idx, list) {

		var currentRow = [];
		this.grid.push(currentRow);
		_.each(_.range(cols), function(col, idx, list) {
			var box = new GridBox(row, col);
			currentRow.push(box);
		});

		if (idx === 0 || idx === (rows - 1)) {
			currentRow.forEach(function(box) { box.setCollideable(); });
		} else {
			_.first(currentRow).setCollideable();
			_.last(currentRow).setCollideable();
		}

	}, this);

	this.getCollisions = function(row, col, caller) {

		var collisions = [];
		if (this.grid[row][col].collideable) {
			collisions.push(this.grid[row][col]);
		}

		var objs = _.union(this.snakes, this.foods);
		for (var i = 0; i < objs.length; i++) {
			var contains = false;
			if (objs[i] === caller) {
				contains = objs[i].containsWithoutHead(row, col);
			} else {
				contains = objs[i].contains(row, col);
			}
			if (contains) {
				collisions.push(objs[i]);
			}
		}

		return collisions;
	};

	this.boxAvailable = function(row, col) {
		return (_.isEmpty(this.getCollisions(row, col)));
	};

	this.randomBox = function() {
		// TODO: Change this to a random sampling of available boxes to avoid long/infinite looping
		while (true) {
			var randRow = Math.floor(Math.random() * this.grid.length);
			var randCol = Math.floor(Math.random() * this.grid[0].length);
			if (this.boxAvailable(randRow, randCol)) { break; }
		}
		return this.grid[randRow][randCol];
	};

	this.fromCoords = function(coords) {
		try { return this.grid[coords[0]][coords[1]]; }
		catch(err) { return null; }
	};

	this.addFood = function() {
		this.foods.push(new Food(this));
	};

	this.addSnake = function(player) {
		this.snakes.push(new Snake(this, 5, player));
	};
};

var Snake = function(parent, initLength, player) {

	this.parent = parent;
	this.player = player;
	this.color = player.color;
	this.collideable = true;
	this.collideType = 'snake';
	this.deadly = true;
	this.directionsDict = {
		'Up': [0, -1],
		'Down': [0, 1],
		'Left': [-1, 0],
		'Right': [1, 0]
	};

	this.grow = function() {
		var head = _.last(this.body);
		var newPosition = addArrays(this.directionsDict[this.direction],
									[head.row, head.col]);
		var newBox = this.parent.fromCoords(newPosition);
		if (newBox) { this.body.push(newBox); }
	};

	while (true) {
		this.body = [this.parent.randomBox()];
		this.direction = _.sample(_.keys(this.directionsDict));
		_.each(_.range(initLength - 1), function() { this.grow(); }, this);
		var available = [];
		_.each(this.body, function(box, idx, list) {
			available.push(this.parent.boxAvailable(box.row, box.col));
		}, this);
		if (_.every(available, function(x) { return (x === true); })) { break; }
	}

	this.shrink = function() {
		this.body.shift();
	};

	this.contains = function(row, col) {
		for (var i = 0; i < this.body.length; i++) {
			var part = this.body[i];
			if (part.row === row && part.col === col) { return true; }
		}
		return false;
	};

	this.containsWithoutHead = function(row, col) {
		for (var i = 0; i < this.body.length - 1; i++) {
			var part = this.body[i];
			if (part.row === row && part.col === col) { return true; }
		}
		return false;
	};

	this.headCollision = function() {
		var head = _.last(this.body);
		var collisions = this.parent.getCollisions(head.row, head.col, this);
		return collisions;
	};

};

var Food = function(parent) {
	this.collideable = true;
	this.collideType = 'food';
	this.deadly = false;

	this.box = parent.randomBox();
	this.color = 'red';
	this.row = this.box.row;
	this.col = this.box.col;

	this.contains = function(row, col) { return (this.row === row && this.col === col); };
};

module.exports.Game = Game;
module.exports.Player = Player;
module.exports.GridBox = GridBox;
module.exports.Grid = Grid;
module.exports.Snake = Snake;
