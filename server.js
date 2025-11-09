const WebSocket = require("ws");

//CONFIGURACION
const PORT = process.env.PORT || 8080;
const SIZE = 500;
const CELL = 20;
const MAX = SIZE - CELL;

//ESTADOS
const jugadores = new Map();
let fruta = posAleatoria();
let nextId = 1;

//Genera posiciones múltiplos de CELL dentro del tablero
function posAleatoria(){
  const randCell = () => Math.floor(Math.random() * (SIZE / CELL)) * CELL;
  return { x: randCell(), y: randCell() };
}

function clampGrid(v){
  if (v < 0) return 0;
  if (v > MAX) return MAX;
  return Math.round(v / CELL) * CELL;
}

function enviar(ws, obj){
  if (ws.readyState === WebSocket.OPEN){
    try { ws.send(JSON.stringify(obj)); } catch {}
  }
}

function broadcast(obj, except = null){
  const msg = JSON.stringify(obj);
  for (const [sock] of jugadores){
    if (sock !== except && sock.readyState === WebSocket.OPEN){
      try { sock.send(msg); } catch {}
    }
  }
}

function parsear(msg){
  try { return JSON.parse(msg); } catch { return null; }
}

function mismaCelda(ax, ay, bx, by){
  return ax === bx && ay === by;
}

//SERVIDOR
const server = new WebSocket.Server({ port: PORT }, () => {
  console.log(`[SERVER] WS listo en puerto ${PORT}`);
  console.log(`[SERVER] Fruta inicial: (${fruta.x}, ${fruta.y})`);
});

server.on("connection", (ws) => {
  //Info del socket
  const raddr = ws?._socket?.remoteAddress;
  const rport = ws?._socket?.remotePort;
  if (raddr && rport) console.log(`[SERVER] Cliente conectado desde ${raddr}:${rport}`);

  //Spawn del jugador
  const spawn = posAleatoria();
  const datos = {
    id: nextId++,
    x: clampGrid(spawn.x),
    y: clampGrid(spawn.y),
    dir: "0",
    puntos: 0
  };

  jugadores.set(ws, datos);
  console.log(`[SERVER] Jugador ${datos.id} conectado en (${datos.x}, ${datos.y}). Total: ${jugadores.size}`);

  //Listado de jugadores actuales cada vez que entra alguien
  if (jugadores.size > 0){
    const lista = [...jugadores.values()]
      .map(d => `ID ${d.id} -> (${d.x}, ${d.y})`)
      .join(" | ");
    console.log(`[SERVER] Jugadores: ${lista}`);
  }

  //Avisamos a TODOS del nuevo jugador
  broadcast({ tipo: "new", datos });

  //Al recién llegado le informamos de los ya existentes
  for (const [sock, d] of jugadores){
    if (sock !== ws) enviar(ws, { tipo: "new", datos: d });
  }

  //Enviar fruta actual
  enviar(ws, { tipo: "fruit", datos: fruta });

  ws.on("message", (raw) => {
    const m = parsear(raw);
    if (!m || typeof m.tipo !== "string") return;

    const self = jugadores.get(ws);
    if (!self) return;

    switch (m.tipo){
      case "mover": {
        if (m.datos){
          if (typeof m.datos.dir === "string") self.dir = m.datos.dir;
          if (Number.isFinite(m.datos.x)) self.x = clampGrid(m.datos.x);
          if (Number.isFinite(m.datos.y)) self.y = clampGrid(m.datos.y);
        }
        broadcast({ tipo:"mover", datos:{ id:self.id, x:self.x, y:self.y, dri:self.dir } });
        break;
      }

      case "comer": {
        let px = self.x, py = self.y;
        if (m.datos){
          if (Number.isFinite(m.datos.x)) px = clampGrid(m.datos.x);
          if (Number.isFinite(m.datos.y)) py = clampGrid(m.datos.y);
        }
        //Validar colisión exacta por celda
        if (mismaCelda(px, py, fruta.x, fruta.y)){
          self.puntos = (self.puntos || 0) + 1;
          broadcast({ tipo:"score", datos:{ id:self.id, puntos:self.puntos } });

          //Nueva fruta
          fruta = posAleatoria();
          fruta.x = clampGrid(fruta.x);
          fruta.y = clampGrid(fruta.y);
          console.log(`[SERVER] Nueva fruta en (${fruta.x}, ${fruta.y})`);
          broadcast({ tipo:"fruit", datos: fruta });
        }
        break;
      }
    }
  });

  ws.on("close", () => {
    const info = jugadores.get(ws);
    jugadores.delete(ws);
    if (info){
      console.log(`[SERVER] Jugador ${info.id} desconectado. Total: ${jugadores.size}`);
      broadcast({ tipo:"delete", datos: info.id });
    }
  });
});
