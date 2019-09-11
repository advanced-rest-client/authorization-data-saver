[![Published on NPM](https://img.shields.io/npm/v/@advanced-rest-client/authorization-data-saver.svg)](https://www.npmjs.com/package/@advanced-rest-client/authorization-data-saver)

[![Build Status](https://travis-ci.org/advanced-rest-client/authorization-data-saver.svg?branch=stage)](https://travis-ci.org/advanced-rest-client/authorization-data-saver)

[![Published on webcomponents.org](https://img.shields.io/badge/webcomponents.org-published-blue.svg)](https://www.webcomponents.org/element/advanced-rest-client/authorization-data-saver)

# &lt;authorization-data-saver&gt;

An element responsible for applying authorization data to the request and requesting auth data from the user.

It dispatches `resend-auth-request` custom event after the user accept dialog with data. The handler should send the request again with updated data.


## Usage

### Installation
```
npm install --save @advanced-rest-client/authorization-data-saver
```

### In a LitElement

```js
import { LitElement, html } from 'lit-element';
import '@advanced-rest-client/authorization-data-saver/authorization-data-saver.js';
import '@advanced-rest-client/arc-models/auth-data-model.js';

class SampleElement extends LitElement {
  render() {
    return html`
    <auth-data-model></auth-data-model>
    <authorization-data-saver></authorization-data-saver>
    `;
  }
}
customElements.define('sample-element', SampleElement);
```

This element requires the `auth-data-model` peer element to be present in the DOM.

## Development

```sh
git clone https://github.com/advanced-rest-client/authorization-data-saver
cd authorization-data-saver
npm install
```

### Running the demo locally

```sh
npm start
```

### Running the tests

```sh
npm test
```

## API components

This components is a part of [API components ecosystem](https://elements.advancedrestclient.com/)
