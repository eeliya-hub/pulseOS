import fs from 'node:fs';

const targets = await fetch('http://127.0.0.1:9231/json/list').then((response) => response.json());
const page = targets.find((target) => target.type === 'page' && target.url.startsWith('http://127.0.0.1:5173/'));

if (!page) {
  throw new Error('Pulse OS page target was not found');
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const entry = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
    else entry.resolve(msg.result);
  }
};

ws.onerror = (error) => {
  console.error(error);
  process.exit(1);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

ws.onopen = async () => {
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1996,
      height: 1280,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
    await wait(900);
    await send('Runtime.evaluate', {
      expression: `Array.from(document.querySelectorAll('button'))
        .find((button) => button.getAttribute('aria-label') === 'Home')
        ?.click();`,
      awaitPromise: true,
    });
    await wait(1000);

    let shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync('/private/tmp/pulse-home-layout.png', Buffer.from(shot.data, 'base64'));
    const homeMetrics = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const h = [...document.querySelectorAll('h1')][0]?.getBoundingClientRect();
        const launch = [...document.querySelectorAll('p')]
          .find((e) => e.textContent.trim() === 'Launchpad')
          ?.parentElement?.getBoundingClientRect();
        const buttons = [...document.querySelectorAll('button[aria-label^="Open"]')]
          .map((b) => b.getBoundingClientRect());
        return {
          heading: h && { top: h.top, bottom: h.bottom, height: h.height },
          launch: launch && { top: launch.top, bottom: launch.bottom, height: launch.height },
          firstButton: buttons[0] && { top: buttons[0].top, bottom: buttons[0].bottom, height: buttons[0].height },
          lastButton: buttons.at(-1) && { top: buttons.at(-1).top, bottom: buttons.at(-1).bottom, height: buttons.at(-1).height },
        };
      })()`,
    });

    await send('Runtime.evaluate', {
      expression: `Array.from(document.querySelectorAll('button'))
        .find((button) => button.getAttribute('aria-label') === 'Life Hub' || button.textContent.includes('Life Hub'))
        ?.click();`,
      awaitPromise: true,
    });
    await wait(700);
    await send('Runtime.evaluate', {
      expression: `Array.from(document.querySelectorAll('button'))
        .find((button) => button.getAttribute('aria-label') === 'Pick a day')
        ?.click();`,
      awaitPromise: true,
    });
    await wait(700);

    shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync('/private/tmp/pulse-calendar-layout.png', Buffer.from(shot.data, 'base64'));
    const calMetrics = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const month = [...document.querySelectorAll('span')]
          .find((e) => /^[A-Za-z]+ \\d{4}$/.test(e.textContent.trim()))
          ?.getBoundingClientRect();
        const header = [...document.querySelectorAll('p')]
          .find((e) => e.textContent.trim() === 'Today')
          ?.getBoundingClientRect();
        const weekday = [...document.querySelectorAll('span')]
          .find((e) => e.textContent.trim() === 'M' && e.getBoundingClientRect().width > 10)
          ?.getBoundingClientRect();
        return {
          header: header && { top: header.top, bottom: header.bottom },
          month: month && { top: month.top, bottom: month.bottom },
          weekday: weekday && { top: weekday.top, bottom: weekday.bottom },
        };
      })()`,
    });

    console.log(JSON.stringify({ home: homeMetrics.result.value, calendar: calMetrics.result.value }, null, 2));
    ws.close();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
