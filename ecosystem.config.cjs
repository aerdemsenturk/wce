// pm2 process definition for production. CI copies this file into the
// standalone release bundle, so `__dirname` is that release's directory and
// pm2 runs Next's minimal server.js straight from it (see deploy.yml).
module.exports = {
  apps: [
    {
      name: "wce",
      script: "server.js",
      cwd: __dirname,
      env: {
        PORT: "3000",
        // Pin it explicitly: standalone server.js binds to $HOSTNAME, and an
        // inherited shell value would otherwise decide the listen address.
        HOSTNAME: "0.0.0.0",
      },
    },
  ],
};
