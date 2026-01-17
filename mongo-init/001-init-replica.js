function sleep(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {}
}

print("Waiting for MongoDB to accept connections...");

while (true) {
  try {
    db.adminCommand({ ping: 1 });
    break;
  } catch (e) {
    sleep(1000);
  }
}

print("MongoDB is reachable, checking replica set...");

try {
  const status = rs.status();
  if (status.ok === 1) {
    print("Replica set already initialized");
    quit(0);
  }
} catch (e) {
  print("Replica set not initialized yet");
}

print("Initializing replica set...");

rs.initiate({
  _id: "rs0",
  members: [{ _id: 0, host: "mongo:27017" }],
});

print("Replica set initiated");

quit(0);
