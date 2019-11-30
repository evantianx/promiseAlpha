const states = {
  PENDING: "pending",
  FULFILLED: "fulfilled",
  REJECTED: "rejected"
};

const isThenable = maybePromise =>
  maybePromise && typeof maybePromise.then === "function";

class PromiseAlpha {
  constructor(computation) {
    this._state = states.PENDING;

    this._value = undefined;
    this._reason = undefined;

    this._thenQueue = [];
    this._finallyQueue = [];

    if (typeof computation === "function") {
      // Here we use setTimeout
      // because in 2.2.4, it says "onFulfilled or onRejected must not be called
      // until the execution context stack contains only platform code"
      // platform code means engine, environment and promise implementation code
      setTimeout(() => {
        try {
          computation(
            this._onFulfilled.bind(this),
            this._onRejected.bind(this)
          );
        } catch (err) {
          this._onRejected(err);
        }
      });
    }
  }

  then(fulfilledFn, catchFn) {
    const controlledPromise = new PromiseAlpha();
    this._thenQueue.push([controlledPromise, fulfilledFn, catchFn]);

    if (this._state === states.FULFILLED) {
      this._propagateFulfilled();
    } else if (this._state === states.REJECTED) {
      this._propagateRejected();
    }

    return controlledPromise;
  }

  catch(catchFn) {
    return this.then(undefined, catchFn);
  }

  finally(sideEffectFn) {
    if (this._state !== states.PENDING) {
      sideEffectFn();
      return this._state === states.FULFILLED
        ? PromiseAlpha.resolve(this._value)
        : PromiseAlpha.reject(this._reason);
    }
    const controlledPromise = new PromiseAlpha();
    this._finallyQueue.push([controlledPromise, sideEffectFn]);

    return controlledPromise;
  }

  _propagateFulfilled() {
    this._thenQueue.forEach(([controlledPromise, fulfilledFn]) => {
      if (typeof fulfilledFn === "function") {
        const valueOrPromise = fulfilledFn(this._value);
        if (isThenable(valueOrPromise)) {
          valueOrPromise.then(
            value => controlledPromise._onFulfilled(value),
            reason => controlledPromise._onRejected(reason)
          );
        } else {
          controlledPromise._onFulfilled(valueOrPromise);
        }
      } else {
        return controlledPromise._onFulfilled(this._value);
      }
    });

    this._finallyQueue.forEach(([controlledPromise, sideEffectFn]) => {
      sideEffectFn();
      controlledPromise._onFulfilled(this._value);
    });

    this._thenQueue = [];
    this._finallyQueue = [];
  }

  _propagateRejected() {
    this._thenQueue.forEach(([controlledPromise, _, catchFn]) => {
      if (typeof catchFn === "function") {
        const valueOrPromise = catchFn(this._reason);
        if (isThenable(valueOrPromise)) {
          valueOrPromise.then(
            value => controlledPromise._onFulfilled(value),
            reason => controlledPromise._onRejected(reason)
          );
        } else {
          controlledPromise._onFulfilled(valueOrPromise);
        }
      } else {
        return controlledPromise._onRejected(this._reason);
      }
    });

    this._finallyQueue.forEach(([controlledPromise, sideEffectFn]) => {
      sideEffectFn();
      controlledPromise._onRejected(this._value);
    });

    this._thenQueue = [];
    this._finallyQueue = [];
  }

  _onFulfilled(value) {
    if (this._state === states.PENDING) {
      this._state = states.FULFILLED;
      this._value = value;
      this._propagateFulfilled();
    }
  }

  _onRejected(reason) {
    if (this._state === states.PENDING) {
      this._state = states.REJECTED;
      this._reason = reason;
      this._propagateRejected();
    }
  }
}

PromiseAlpha.resolve = value => new PromiseAlpha(resolve => resolve(value));
PromiseAlpha.reject = reason => new PromiseAlpha((_, reject) => reject(reason));

const fs = require("fs");
const path = require("path");

const readFile = (filename, encoding) =>
  new PromiseAlpha((resolve, reject) => {
    fs.readFile(filename, encoding, (err, value) => {
      if (err) return reject(err);
      resolve(value);
    });
  });

const delay = (timeInMs, value) =>
  new PromiseAlpha(resolve => {
    setTimeout(() => {
      resolve(value);
    }, timeInMs);
  });

readFile(path.join(__dirname, "indexs.js"), "utf8")
  .then(text => {
    console.log(`${text.length} charactors read`);
    return delay(2000, text.replace(/[aeiou]/g, ""));
  })
  .then(newText => {
    console.log(newText.slice(0, 200));
  })
  .catch(err => {
    console.error("An error occured!");
    console.error(err);
  })
  .finally(() => {
    console.log("===All done===");
  });
