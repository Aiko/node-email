const IMAP = require('./conn.js')
const args = process.argv.slice(2)
const fetch = require('node-fetch')

console.log({
    host: args[0],
    port: args[1],
    user: args[2],
    pass: args[3]
})

let client = new IMAP({
    host: args[0],
    port: args[1],
    user: args[2],
    pass: args[3]
})

let x = async () => {
    await client.open()
    console.log("Logging in...")
    await client.login()
    console.log("Getting folders...")
    let folders = await client.getFolders()
    folders.forEach(_ => console.log('\t' + _))
    console.log("Selecting inbox...")
    await client.select('INBOX')
    console.log("Counting messages...")
    let numEmails = await client.countMessages('INBOX')
    console.log(numEmails)
    console.log("Fetching emails...")
    let emails = await client.getEmails('*', '*')
    console.log(`Got ${emails.length} emails`)
    console.log("Fetching senders...")
    let senders = await client.getSenders('*', '*')
    console.log(emails[0].headers)
    console.log(senders[0])
}
x()

