/**
@license
Copyright 2018 Pawel Psztyc
Licensed under the Apache License, Version 2.0 (the "License"); you may not
use this file except in compliance with the License. You may obtain a copy of
the License at
http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
License for the specific language governing permissions and limitations under
the License.
*/
import {PolymerElement} from '../../@polymer/polymer/polymer-element.js';
import {html} from '../../@polymer/polymer/lib/utils/html-tag.js';
import {HeadersParserMixin} from '../../@advanced-rest-client/headers-parser-mixin/headers-parser-mixin.js';
import '../../@advanced-rest-client/auth-dialogs/auth-dialogs.js';
/**
 * An element responsible for applying authorization data to the request
 * before sending it to a server and requesting credentials data from the user.
 * It contains UI dialogs to request data from the user for Basic and NTLM
 * authorization. It listens for `before-request` and `response-ready` events
 * as defined
 * [in this issue](https://github.com/jarrodek/ChromeRestClient/issues/1010).
 *
 * The element's API is based on custom events fired by the request editor
 * (controller). There's no need to directly call any function or set a
 * property. It adds event listeners to the `window` object. It should be
 * placed as close to the `<body>` as possible.
 *
 * The `before-request` event is handled synchronously.
 *
 * ### Styling
 *
 * See [auth-dialogs](https://github.com/advanced-rest-client/auth-dialogs) for styling options.
 *
 * ### Demo
 *
 * See [auth-dialogs](https://github.com/advanced-rest-client/auth-dialogs) for dialogs demos.
 *
 * @polymer
 * @customElement
 * @memberof LogicElements
 * @demo demo/index.html
 * @appliesMixin ArcBehaviors.HeadersParserBehavior
 */
class AuthorizationDataSaver extends HeadersParserMixin(PolymerElement) {
  static get template() {
    return html`
    <style>
    :host {
      margin: 0;
      padding: 0;
      width: 0;
      height: 0;
      /* If display none then the dialogs won't be displayed */
    }
    </style>
    <auth-dialog-basic></auth-dialog-basic>
    <auth-dialog-ntlm></auth-dialog-ntlm>
`;
  }

  static get properties() {
    return {
      /**
       * URL of the request related to current operation.
       */
      url: String,
      /**
       * Cashed list of authorization data for current session.
       * It is here so the element won't ask data store for data that already has been received.
       */
      _cache: Array,
      /**
       * Currently opened dialog name.
       */
      _openedDialog: String
    };
  }

  static get observers() {
    return ['_restoreDialogData(url, _openedDialog)'];
  }

  /**
   * Reference to currently opened dialog
   *
   * @return {HTMLElement|null} Returns dialog or `null`
   */
  get dialog() {
    return this.shadowRoot.querySelector('auth-dialog-' + this._openedDialog);
  }

  constructor() {
    super();
    this._onAuthDialogResult = this._onAuthDialogResult.bind(this);
    this._beforeRequestHandler = this._beforeRequestHandler.bind(this);
    this._afterRequestHandler = this._afterRequestHandler.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('auth-dialog-closed', this._onAuthDialogResult);
    window.addEventListener('before-request', this._beforeRequestHandler);
    window.addEventListener('api-response', this._afterRequestHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('auth-dialog-closed', this._onAuthDialogResult);
    window.removeEventListener('before-request', this._beforeRequestHandler);
    window.removeEventListener('api-response', this._afterRequestHandler);
  }
  /**
   * Handler for the ARC's event `before-request`.
   * The event will be handled synchronously.
   *
   * @param {CustomEvent} e
   */
  _beforeRequestHandler(e) {
    this.processRequest(e.detail);
  }
  /**
   * Processes request before it's send to the transport library.
   * It sets
   * To mimic browser behavior the authorization data won't be set unless at least once in the
   * session the user has set authorization data for current URL.
   *
   * @param {Object} request The ArcRequest object
   */
  processRequest(request) {
    let headers = request.headers;
    if (!headers) {
      headers = '';
    }
    if (/^authorization:\s?.+$/gim.test(headers)) {
      // Already has authorization.
      return;
    }
    if (!request.url) {
      return;
    }
    // Try to find an auth data for the URL. If has a match, apply it to the request
    const url = this._computeUrlPath(request.url);
    let authData = this._findCachedAuthData('basic', url);
    if (authData) {
      this._applyRequestBasicAuthData(request, authData);
      return;
    }
    // Try NTLM
    authData = this._findCachedAuthData('ntlm', url);
    if (authData) {
      this._applyRequestNtlmAuthData(request, authData);
      return;
    }
  }
  /**
   * Applies the basic authorization data to the request.
   *
   * If the header value have changed then it fires `request-headers-changed` custom event.
   * It sets computed value of the readers to the event's detail object.
   *
   * @param {Object} request The event's detail object. Changes made here will be propagated to
   * the event.
   * @param {Object} data The authorization data to apply.
   */
  _applyRequestBasicAuthData(request, data) {
    const value = 'Basic ' + data.hash;
    const headers = request.headers || '';
    const newHeaders = this.replaceHeaderValue(headers, 'authorization', value);
    if (headers !== newHeaders) {
      this.dispatchEvent(new CustomEvent('request-headers-changed', {
        composed: true,
        bubbles: true,
        detail: {
          value: newHeaders
        }
      }));
      request.headers = newHeaders;
    }
  }
  /**
   * Applies the NTLM authorization data to the request.
   *
   * Because NTLM requires certain operations on a socket it's bot just about setting a headers
   * but whole NTLM configuration object.
   *
   * Applied the `auth` object to the event's `detail.auth` object.
   *
   * @param {Object} request The event's detail object. Changes made here will be propagated to
   * the event.
   * @param {Object} values The authorization data to apply.
   */
  _applyRequestNtlmAuthData(request, values) {
    const auth = {};
    auth.username = values.username;
    auth.password = values.password;
    auth.domain = values.domain;
    auth.method = 'ntlm';
    request.auth = auth;
  }

  /* AFTER RESPONSE */

  /**
   * Handler to the `response-ready` event
   * @param {CustomEvent} e
   */
  _afterRequestHandler(e) {
    const method = this.authorizationMethodFromResponse(e.detail.response);
    if (!method) {
      return;
    }
    // Async so the response can be rendered to the user.
    setTimeout(() => {
      this._processAuthResponse(method, e.detail.request, e.detail.id);
    }, 1);
  }
  /**
   * Checks if the response require authorization and if so it returns the authorization
   * method name for the endpoint.
   *
   * @param {Response} response The response object associated with the request
   * @return {String|undefined} Authorization method or undefined if not found or not supported.
   */
  authorizationMethodFromResponse(response) {
    if (!response || response.status !== 401) {
      return;
    }
    const list = this.headersToJSON(response.headers);
    let auth;
    for (let i = 0, len = list.length; i < len; i++) {
      if (list[i].name.toLowerCase() === 'www-authenticate') {
        auth = list[i].value;
        break;
      }
    }
    if (!auth) {
      return;
    }
    auth = auth.toLowerCase();
    if (auth.indexOf('ntlm') !== -1) {
      return 'ntlm';
    } else if (auth.indexOf('basic') !== -1) {
      return 'basic';
    }
  }
  /**
   * Checks response object for any auth request.
   * If authorization is required for the endpoint it will display corresponding dialog if
   * supported.
   *
   * This function shouldn't interrupt normal response flow. Id will display authorization
   * dialog if required and when the user accept the dialog it fires the `resend-auth-request`
   * custom event.
   *
   * This function exists quietly if any of the arguments are not set.
   *
   * @param {String} method Authorization method
   * @param {Request} request The request object.
   * @param {String} id Request ID
   */
  _processAuthResponse(method, request, id) {
    if (!method || !request || !request.url) {
      return;
    }
    this.__dialogResultId = id;
    switch (method) {
      case 'basic':
        this._openBasicAuthDialog(request.url);
        break;
      case 'ntlm':
        this._openNtlmAuthDialog(request.url);
        break;
    }
  }
  /**
   * Opens a basic authorization dialog when response status is 401 and basic or digest
   * authorization is required.
   *
   * @param {String} url
   */
  _openBasicAuthDialog(url) {
    if (this.url !== url) {
      this.set('url', url);
    }
    this._openedDialog = 'basic';
    this.dialog.opened = true;
  }
  /**
   * Opens the NTLM authorization dialog when response status is 401 and NTLM authorization
   * is required.
   * @param {String} url
   */
  _openNtlmAuthDialog(url) {
    if (this.url !== url) {
      this.set('url', url);
    }
    this._openedDialog = 'ntlm';
    this.dialog.opened = true;
  }
  /**
   * Restores the database object entry or cached object if any.
   *
   * @param {String} url The URL of the request
   * @param {String} authMethod The Authorization method to restore data for.
   */
  _restoreDialogData(url, authMethod) {
    const e = new CustomEvent('auth-data-query', {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail: {
        url,
        authMethod
      }
    });
    this.dispatchEvent(e);
    if (!e.defaultPrevented) {
      console.warn('auth-data-query event not handled');
      return;
    }
    e.detail.result
    .then((authData) => {
      if (authData) {
        this._setRestoredAuthData(authMethod, authData);
      }
    });
  }
  /**
   * Finds an auth data for given `url`.
   *
   * @param {String} type Authorization type.
   * @param {String} url The URL of the request.
   * @return {Object|undefined} Auth data if exists in the cache.
   */
  _findCachedAuthData(type, url) {
    const cache = this._cache;
    if (!cache || !type || !url || !cache[type]) {
      return;
    }
    return cache[type][url];
  }
  /**
   * Sends authorization data to the cache.
   *
   * @param {String} type Authorization type.
   * @param {String} url current request URL
   * @param {Object} data Authorization data to store.
   */
  _cacheAuthData(type, url, data) {
    if (!this._cache) {
      this._cache = {};
    }
    if (!(type in this._cache)) {
      this._cache[type] = {};
    }
    this._cache[type][url] = data;
  }
  /**
   * Called when stored authorization data has been found in database or cache.
   * It updates the data in opened dialog.
   *
   * @param {String} authMethod
   * @param {Object} doc
   */
  _setRestoredAuthData(authMethod, doc) {
    switch (authMethod) {
      case 'basic':
        this._restoreBasicData(doc);
        break;
      case 'ntlm':
        this._restoreNtlmData(doc);
        break;
    }
  }
  /**
   * Restore stored data to basic auth dialog.
   *
   * @param {Object} doc Stored authorization data.
   */
  _restoreBasicData(doc) {
    if (!doc) {
      return;
    }
    const dialog = this.dialog;
    dialog.username = doc.username;
    dialog.password = doc.password;
  }
  /**
   * Restore stored data to NTLM auth dialog.
   *
   * @param {Object} doc Stored authorization data.
   */
  _restoreNtlmData(doc) {
    if (!doc) {
      return;
    }
    const dialog = this.dialog;
    dialog.username = doc.username;
    dialog.password = doc.password;
    dialog.domain = doc.domain;
  }
  /**
   * Removes query parameters and the fragment part from the URL
   * @param {String} url URL to process
   * @return {String} Canonical URL.
   */
  _computeUrlPath(url) {
    if (!url) {
      return '';
    }
    try {
      const u = new URL(url);
      u.hash = '';
      u.search = '';
      let result = u.toString();
      // polyfill library has some error and leaves '?#' if was set
      result = result.replace('?', '');
      result = result.replace('#', '');
      return result;
    } catch (e) {
      return url;
    }
  }

  /**
   * Called when the authorization dialog has been closed.
   * @param {CustomEvent} e
   */
  _onAuthDialogResult(e) {
    this._openedDialog = undefined;
    const requestId = this.__dialogResultId;
    delete this.__dialogResultId;
    if (e.detail.cancelled) {
      return;
    }
    let store = false;
    switch (e.detail.type) {
      case 'ntlm':
        store = true;
        this._setNtlmAuthData(e.detail.value, requestId);
        break;
      case 'basic':
        store = true;
        this._setBasicAuthData(e.detail.value, requestId);
        break;
    }
    if (store) {
      setTimeout(() => this._storeAuthData(e.detail.type, e.detail.value), 1);
    }
  }
  /**
   * Sets the NTLM authorization data and sends the `ntlm-data-changed` event so the request
   * editor can attach it to the next request.
   *
   * @param {Object} values Map with values from dialog event.
   * @param {String} id Request ID
   */
  _setNtlmAuthData(values, id) {
    if (!values) {
      return;
    }
    const url = this._computeUrlPath(this.url);
    this._cacheAuthData('ntlm', url, values);
    const auth = {};
    auth.username = values.username;
    auth.password = values.password;
    auth.domain = values.domain;
    auth.method = 'ntlm';
    this.dispatchEvent(new CustomEvent('ntlm-data-changed', {
      composed: true,
      bubbles: true,
      detail: {
        value: auth,
        id: id
      }
    }));
    this._resendRequest(id);
  }
  /**
   * Sets the basic authorization data in the `headers` property or in headers in the `request`
   * object if provided.
   *
   * @param {Object} values Map with values from dialog event.
   * @param {String} id Request ID
   */
  _setBasicAuthData(values, id) {
    if (!values) {
      return;
    }
    const url = this._computeUrlPath(this.url);
    this._cacheAuthData('basic', url, values);
    const value = 'Basic ' + values.hash;
    this.dispatchEvent(new CustomEvent('request-header-changed', {
      composed: true,
      bubbles: true,
      detail: {
        name: 'authorization',
        value: value
      }
    }));
    this._resendRequest(id);
  }
  /**
   * Sends an event about sending request with auth data.
   * @param {String} id Request ID
   */
  _resendRequest(id) {
    this.dispatchEvent(new CustomEvent('resend-auth-request', {
      composed: true,
      bubbles: true,
      detail: {
        id
      }
    }));
  }
  /**
   * Stores the data in the datastore.
   *
   * @param {String} authMethod
   * @param {Object} authData
   */
  _storeAuthData(authMethod, authData) {
    const e = new CustomEvent('auth-data-changed', {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail: {
        url: this.url,
        authMethod,
        authData
      }
    });
    this.dispatchEvent(e);
    if (!e.defaultPrevented) {
      console.warn('auth-data-changed event not handled');
    }
  }

  /**
   * Fired when the request headers changed because of applied authorization.
   *
   * @event request-headers-changed
   * @param {String} value New headers value.
   */
  /**
   * Fired when the user accepted authorization dialog, the request object has been altered and
   * the request is ready to be called again.
   *
   * @event resend-auth-request
   */
  /**
   * Fires when the NTLM authorization data are received from user input.
   * The request builder element should intercept this event and attach it to the next request.
   *
   * @event ntlm-data-changed
   * @property {Object} Map of auth properties: `username`, `password` and `domain`.
   */
  /**
   * Fired when the header value has changed.
   *
   * @event request-header-changed
   * @param {String} name Name of the header
   * @param {String} value Value of the header
   */
}
window.customElements.define('authorization-data-saver', AuthorizationDataSaver);
