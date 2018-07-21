const IMAP = require('./conn.js')
const args = process.argv.slice(2)

client = new IMAP({
    host: args[0],
    port: args[1],
    user: args[2],
    pass: args[3]
})

client.open().then(() => {
    console.debug("Connected to IMAP")
    client.login().then(() => {
        console.debug("Logged in")
        client.getFolders()
            .then((folders) => folders.forEach(_ => console.log(_)))
            .catch((e) => console.error(e))
    }).catch((e) => console.error(e))
}).catch((e) => console.error(e))