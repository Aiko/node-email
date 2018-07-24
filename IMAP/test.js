const IMAP = require('./conn.js')
const args = process.argv.slice(2)
const fetch = require('node-fetch')

let client = new IMAP({
    host: args[0],
    port: args[1],
    user: args[2],
    pass: args[3]
})

async function test() {
    await client.open()
    await client.login()
    let folders = await client.getFolders()
    folders.forEach(_ => console.log('\t' + _))
    await client.select('INBOX')
    let emails = await client.getEmails(500, 500)
    console.log('got')
    console.log(emails)
}

test()