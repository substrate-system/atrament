import { test } from '@substrate-system/tapzero'
import Atrament from '../src/index.js'

test('atrament', (t) => {
    document.body.innerHTML += '<canvas id="root"></canvas>'
    const atrament = new Atrament('#root')
    t.ok(atrament, "Doesn't explode")
})

test('all done', () => {
    // @ts-expect-error tests
    window.testsFinished = true
})
