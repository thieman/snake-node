var host = location.origin.replace(/^http/, 'ws');
var ws = new WebSocket(host);

var canvas = document.getElementById('snakeGameCanvas');
var gameHeight = canvas.height;
var gameWidth = canvas.width;
var bgColor = 'white';
var context = canvas.getContext('2d');
var direction = null;

ws.onmessage = function(event) {
	var data = JSON.parse(event.data);

	for (var i = 0; i < data.responses.length; i++) {
		var response = data.responses[i];
		if (response.type === 'gameOver') {
			gameOver();
			return;
		}
	}

	renderGame(data.grid);
	ws.send(JSON.stringify({direction: direction}));

};

var renderGame = function(grid) {
	_.each(_.flatten(grid.grid), function(box) { renderBox(grid.grid, box); });
	_.each(grid.foods, function(food) { renderFood(grid.grid, food); });
	_.each(grid.snakes, function(snake) { renderSnake(grid.grid, snake); });
};

var renderBox = function(grid, box) {
	var boxHeight = gameHeight / grid.length;
	var boxWidth = gameWidth / grid[0].length;
	context.fillStyle = box.color;
	context.fillRect(box.row * boxHeight, box.col * boxWidth,
					 boxHeight, boxWidth, box.color);
};

var renderFood = function(grid, food) {
	var clonedBox = _.clone(food.box);
	clonedBox.color = food.color;
	renderBox(grid, clonedBox);
};

var renderSnake = function(grid, snake) {
	_.each(snake.body, function(box) {
		var clonedBox = _.clone(box);
		clonedBox.color = snake.color;
		renderBox(grid, clonedBox);
	});
};

var gameOver = function() {
	ws.close();
	$('#header').text('GAME OVER TROLOLOLOL');
};

document.addEventListener('keydown', function(keyPress) {
	var pressed = keyPress.keyIdentifier;
	if (_.contains(['Up', 'Down', 'Left', 'Right'], pressed)) {
		direction = pressed;
	}
});
