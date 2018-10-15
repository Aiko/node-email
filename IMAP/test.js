const IMAP = require('./conn.js')
const args = process.argv.slice(2)
const fetch = require('node-fetch')

let client = new IMAP({
    host: args[0],
    port: args[1],
    user: args[2],
    pass: args[3]
})

let x = async () => {
    await client.open()
    await client.login()
    let folders = await client.getFolders()
    folders.forEach(_ => console.log('\t' + _))
    await client.select('INBOX')
    let numEmails = await client.countMessages('INBOX')
    console.log(numEmails)
    let emails = await client.getEmails('*', '*')
    console.log(`Got ${emails.length} emails`)
    console.log(emails[0].headers)
}
x()

