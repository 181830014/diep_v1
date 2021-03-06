var
    express = require('express'),
    app = express(),
    path = require('path'),
    http = require('http').Server(app),
    io = require('socket.io')(http),
    uid = 0,
    bid = 0,
    cid = 0;
    tid = 0;

const MAX_CREEP_COUNT = 15;
const CANVAS_WIDTH = 2000;
const CANVAS_HEIGHT = 2000;

tripPool = new Array();
tankPool = new Array();
creepPool = new Array();
bulletPool = new Array();

// var IDPool = require('./idpool.js');

app.use(express.static(__dirname + '/'));
app.use(express.static(path.join(__dirname, 'public')));


app.get('/', function(req, res){
  res.sendfile('index.html',{root:__dirname});
});


io.on('connection', function(socket){

  socket.tank = null;
  socket.on('name', function(data) {
    ++uid;
    let tank = {
      x:Math.random() * 1530, y:Math.random() * 720, id: (uid << 10) + (1 << 4),
      hp: 100, maxhp: 100, bodyDamage: 1, transparent: 1
    };
    socket.tank = tank;

    for(let i = 0; i < tankPool.length; i++)  // 通知全体坦克
      broadcast('addTank', ['addTank', tank.id, tank.x, tank.y, tank.hp, tank.maxhp, tank.bodyDamage, tank.transparent]);
    tankPool.push(socket);

    for(let i = 0; i < tankPool.length; i++)             // 全体坦克通知自己
      socket.emit('addTank', ['addTank', tankPool[i].tank.id, tankPool[i].tank.x, tankPool[i].tank.y,
        tankPool[i].tank.hp, tankPool[i].tank.maxhp, tankPool[i].tank.bodyDamage, tankPool[i].tank.transparent]);
    for(let i = 0; i < creepPool.length; i++)  // 全体野怪通知自己
      socket.emit('addCreep', ['addCreep', creepPool[i].id, creepPool[i].x, creepPool[i].y,
        creepPool[i].hp, creepPool[i].maxhp, creepPool[i].bodyDamage]);

    socket.emit('control', ['control', socket.tank.id, data[1]]);

    console.log("Total players " + tankPool.length);
  });

  socket.on('disconnect', function() {
    if(!socket.tank) return;
    var des = socket.tank.id;
    findDelete(socket.tank.id);
    broadcast('killed', ['killed', socket.tank.id]);
    console.log("Total players " + tankPool.length);
  });

  socket.on('move', function(data) {
    let tk = find(data[1]);
    if(!tk) return;
    tk.x = data[2], tk.y = data[3];
    broadcast('move', data, data[1]);
  });

  socket.on('turn', function(data) {
    broadcast('turn', data, data[1]);
  });

  socket.on('pturn', function(data) {
    broadcast('pturn', data, data[1]);
  });

  socket.on('fire', function(data) {
    ++ bid;
    data[3] = (bid << 10) + 4;   // 01 00
    bulletPool.push(bid);        // todo: record bullet info
    broadcast('fire', data);
  });

  socket.on('trip', function(data) {
    ++ tid;
    data[3] = (tid << 10) + 12;   // 11 00
    let curTime = new Date();
    let trip = {id: data[3], x: data[1], y: data[2], hp: 1, maxhp: 1, 
      bodyDamage: data[5], startTime: curTime};
    creepPool.push(trip);
    broadcast('trip', data);
  });

  socket.on('collide', function(data) {
    let creep = find(data[1]);
    if(!creep) return;
    broadcast('collide', data);
    creep.x = data[2], creep.y = data[3];
  })

  socket.on('transparent', function(data) {
    console.log('trans: ', data[1]);
    let tk = find(data[1]);
    if(!tk) return;
    broadcast('transparent', data, data[1]);
    tk.transparent = data[2];
  })

  socket.on('HPdrop', function(data) {
    console.log('HPdrop id = ', data[1]);
    let obj = find(data[1]);
    if(!obj) return;
    obj.hp = data[2];
    broadcast('HPdrop', data);
  });

  socket.on('upgrade', function(data) {
    let obj = find(data[1]);
    if(!obj) return;
    if(data[2] == 1) {
      obj.maxhp += 20;
      obj.hp += 20;
    }
    else if(data[2] == 2) { //bodyDamage
      obj.bodyDamage += 1;
    }
    else if(data[2] == 7)
      obj.id = obj.id & 0xfc00 | data[3];
    broadcast('upgrade', data);
  });

  socket.on('killed', function(data) {
    // console.log('socket get killed');
    broadcast('killed', data);
    console.log(data[1], 'killed');
    findDelete(data[1]);
  });

});

function broadcast(func, data, ignoreId=0) {
  for(let i = 0; i < tankPool.length; i++)
    if(tankPool[i].tank.id != ignoreId)
      tankPool[i].emit(func, data);
}

function find(id) {
  for(let i = 0; i < tankPool.length; i++)
    if(tankPool[i].tank.id == id)
      return tankPool[i].tank;
  for(let i = 0; i < bulletPool.length; i++)
    if(bulletPool[i].id == id)
      return bulletPool[i];
  for(let i = 0; i < creepPool.length; i++)
    if(creepPool[i].id == id)
      return creepPool[i];
  return null;
}

function findDelete(id) {
  for(let i = 0; i < tankPool.length; i++)
    if(tankPool[i].tank.id == id) {
      tankPool.splice(i, 1);
      return;
    }
  for(let i = 0; i < bulletPool.length; i++)
    if(bulletPool[i].id == id) {
      bulletPool.splice(i, 1);
      return;
    }
  for(let i = 0; i < creepPool.length; i++)
    if(creepPool[i].id == id) {
      creepPool.splice(i, 1);
      return;
    }
}

function isCollided(obj1, obj2) {  // 判断两物块是否碰撞
  if(obj1.id == obj2.id)
    return false;
  let dx = obj1.x - obj2.x;
  let dy = obj1.y - obj2.y;
  let dis = dx * dx + dy * dy;
  let sumr = obj1.r * obj1.scaleX + obj2.r * obj2.scaleX;
  return dis <= sumr * sumr;
}

function checkCollision() {
  for(let i = 0; i < tankPool.length; i++)      // tank - tank
    for(let j = i+1; j < tankPool.length; j++)
      if(isCollided(tankPool[i].tank, tankPool[j].tank))
        broadcast('HPdrop', ['HPdrop', ]);

  for(let i = 0; i < tankPool.length; i++)      // tank - creep
    for(let j = 0; j < creepPool.length; j++)
      if(isCollided(tankPool[i].tank, creepPool[j]))
        broadcast();

  for(let i = 0; i < bulletPool.length; i++)    // bullet - tank
    for(let j = 0; j < tankPool.length; j++)
      if(isCollided(bulletPool[i], tankPool[j].tank))
        broadcast();

  for(let i = 0; i < bulletPool.length; i++)      // bullet - creep
    for(let j = 0; j < creepPool.length; j++)
      if(isCollided(bulletPool[i], creepPool[j]))
        broadcast();
}

function checkType(id) {
  return ((id >> 2) & 3);
}

function generate_coordinate() {
  let x, y, flag=1;
  while(flag)
  {
    flag = 0;
    x = Math.random() * (CANVAS_WIDTH - 200) + 100;
    y = Math.random() * (CANVAS_HEIGHT - 200) + 100;
    return [x, y];
    for(let i = 0; i < tankPool.length; i++)
      if(Math.abs(tankPool[i].tank.x - x) < 70 || Math.abs(tankPool[i].tank.y - y) < 70)
      {flag=1;break;}
    for(let i = 0; i < creepPool.length; i++)
      if(Math.abs(creepPool[i].x - x) < 70 || Math.abs(creepPool[i].y - y) < 70)
      {flag=1;break;}
    for(let i = 0; i < bulletPool.length; i++)
      if(Math.abs(bulletPool[i].x - x) < 70 || Math.abs(bulletPool[i].y - y) < 70)
      {flag=1;break;}
  }
  return [x, y];
}

function addCreep() {
  let count = 0;
  for(let i = 0; i < creepPool.length; i++)
    if((creepPool[i].id >> 2 & 3) == 2)
      count ++;
  if(count == MAX_CREEP_COUNT)
    return;
  ++cid;
  let coordinate = generate_coordinate();
  let creep = {
    x:coordinate[0], y:coordinate[1], id: (cid << 10) + 8 + Math.floor(Math.random() * 4),
    hp: 100, maxhp: 100, bodyDamage: 1
  };
  creepPool.push(creep);
  console.log('addCreep: id = ', creep.id);
  broadcast('addCreep', ['addCreep', creep.id, creep.x, creep.y, creep.hp, creep.maxhp, creep.bodyDamage]);
}
setInterval(addCreep, 5000);

function clearTrip() {
  let curTime = new Date();
  for(let i = 0; i < creepPool.length; i++)
    if((creepPool[i].id >> 2 & 3) == 3)
    {
      let trip = creepPool[i];
      if(curTime - trip.startTime >= 20000)
        broadcast('killed', ['killed', trip.id]);
    }
}
setInterval(clearTrip, 1000);

http.listen(3030, function(){
  console.log('listening on *:3030');
});