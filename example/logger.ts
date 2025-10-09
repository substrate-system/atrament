// a little helper tool for logging events
const eventsLog: string[] = []
const logElement = document.getElementById('events')!

export default (...messages: any[]): void => {
    if (eventsLog.push(messages.map((m) => JSON.stringify(m)).join()) > 5) {
        eventsLog.shift()
    }

    logElement.innerText = eventsLog.join('\n')
    // eslint-disable-next-line no-console
    console.log(...messages)
}
