export const waitForMock = (duration = 420) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
