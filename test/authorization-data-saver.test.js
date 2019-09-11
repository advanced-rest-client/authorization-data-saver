import { fixture, assert, html } from '@open-wc/testing';
import * as sinon from 'sinon/pkg/sinon-esm.js';
import '@advanced-rest-client/arc-models/auth-data-model.js';
import '../authorization-data-saver.js';

describe('<authorization-data-saver>', function() {
  async function basicFixture() {
    const element = await fixture(html`
      <div>
        <auth-data-model></auth-data-model>
        <authorization-data-saver></authorization-data-saver>
      </div>
    `);
    return element.querySelector('authorization-data-saver');
  }

  describe('basics', () => {
    const initUrl = 'http://domain.com/path/?c=d#hash';
    const cleanUrl = 'http://domain.com/path/';

    function createResponse(authType, status, statusText) {
      status = status || 401;
      statusText = statusText || 'Authorization required';
      let headers = 'x-token: abc\n';
      if (authType === 'ntlm') {
        headers += 'www-authenticate: ntlm';
      } else if (authType === 'basic') {
        headers += 'www-authenticate: basic';
      }
      return {
        status,
        statusText,
        headers,
        payload: 'test'
      };
    }

    function createRequest() {
      return {
        url: initUrl,
        headers: 'x-token: abc',
        method: 'GET'
      };
    }

    const basicObj = {
      username: 'test',
      password: 'test',
      hash: 'dGVzdDp0ZXN0'
    };

    const authObj = {
      username: 'test',
      password: 'test',
      domain: 'domain.com',
      method: 'ntlm'
    };

    describe('basic', function() {
      describe('authorizationMethodFromResponse', function() {
        let element;
        beforeEach(async () => {
          element = await basicFixture();
        });

        it('Should not return for not 401 status', function() {
          const response = createResponse('basic', 200, 'OK');
          const method = element.authorizationMethodFromResponse(response);
          assert.isUndefined(method);
        });

        it('Should not return if no www-authenticate header is present', function() {
          const response = createResponse(null, null, {});
          const method = element.authorizationMethodFromResponse(response);
          assert.isUndefined(method);
        });

        it('Should return "basic"', function() {
          const response = createResponse('basic');
          const method = element.authorizationMethodFromResponse(response);
          assert.equal(method, 'basic');
        });

        it('Should return "ntlm"', function() {
          const response = createResponse('ntlm', null, null);
          const method = element.authorizationMethodFromResponse(response);
          assert.equal(method, 'ntlm');
        });

        it('Returns undefined when method is not know', function() {
          const response = createResponse('other', null, null);
          const method = element.authorizationMethodFromResponse(response);
          assert.isUndefined(method);
        });
      });

      describe('_processAuthResponse()', function() {
        let element;
        beforeEach(async () => {
          element = await basicFixture();
        });

        it('Should open basic dialog', function() {
          const request = createRequest();
          element._processAuthResponse('basic', request);
          assert.equal(element.dialog.nodeName, 'AUTH-DIALOG-BASIC', 'Dialog is auth-dialog-basic');
          assert.isTrue(element.dialog.opened, 'Dialog is opened');
        });

        it('Should open ntlm dialog', function() {
          const request = createRequest();
          element._processAuthResponse('ntlm', request);
          assert.equal(element.dialog.nodeName, 'AUTH-DIALOG-NTLM', 'Dialog is auth-dialog-ntlm');
          assert.isTrue(element.dialog.opened, 'Dialog is opened');
        });

        it('Sets __dialogResultId', function() {
          const request = createRequest();
          element._processAuthResponse('basic', request, 'test-id');
          assert.equal(element.__dialogResultId, 'test-id');
        });

        it('Does nothing when method is missing', function() {
          const request = createRequest();
          element._processAuthResponse(undefined, request, 'test-id');
          assert.isUndefined(element.__dialogResultId);
        });

        it('Does nothing when request is missing', function() {
          element._processAuthResponse('basic', undefined, 'test-id');
          assert.isUndefined(element.__dialogResultId);
        });

        it('Does nothing when request.url is missing', function() {
          const request = createRequest();
          delete request.url;
          element._processAuthResponse('basic', request, 'test-id');
          assert.isUndefined(element.__dialogResultId);
        });
      });

      describe('_cacheAuthData()', function() {
        let element;
        beforeEach(async () => {
          element = await basicFixture();
        });

        it('Should cache basic data', function() {
          element._cacheAuthData('basic', initUrl, basicObj);
          assert.deepEqual(element._cache.basic[initUrl], basicObj);
        });

        it('Should cache ntlm data', function() {
          element._cacheAuthData('ntlm', initUrl, authObj);
          assert.deepEqual(element._cache.ntlm[initUrl], authObj);
        });
      });

      describe('_findCachedAuthData()', function() {
        let element;
        beforeEach(async () => {
          element = await basicFixture();
        });

        it('Should not find data for empty cache', function() {
          const auth = element._findCachedAuthData('basic', initUrl);
          assert.isUndefined(auth);
        });

        it('Should not find data in basic map', function() {
          element._cacheAuthData('basic', initUrl, basicObj);
          const auth = element._findCachedAuthData('basic', 'mulesoft.com');
          assert.isUndefined(auth);
        });

        it('Should find data in basic map', function() {
          element._cacheAuthData('basic', cleanUrl, basicObj);
          const auth = element._findCachedAuthData('basic', cleanUrl);
          assert.deepEqual(auth, basicObj);
        });

        it('Should find data in ntlm map', function() {
          element._cacheAuthData('ntlm', cleanUrl, authObj);
          const auth = element._findCachedAuthData('ntlm', cleanUrl);
          assert.deepEqual(auth, authObj);
        });
      });

      describe('_computeUrlPath()', function() {
        let element;
        beforeEach(async () => {
          element = await basicFixture();
        });

        it('Computes database key for basic auth', function() {
          const url = element._computeUrlPath(initUrl);
          assert.equal(url, cleanUrl);
        });

        it('Returns empty string when no argument', () => {
          const result = element._computeUrlPath();
          assert.equal(result, '');
        });

        it('Returns passed argument when url is invalid', () => {
          const result = element._computeUrlPath('test');
          assert.equal(result, 'test');
        });
      });

      function authDialogValue(type) {
        const value = {
          username: 'test',
          password: 'test'
        };
        switch (type) {
          case 'basic': value.hash = 'dGVzdDp0ZXN0'; break;
          case 'ntlm': value.domain = 'domain.com'; break;
        }
        return value;
      }

      function createAuthDialogEvent(type) {
        const obj = {
          detail: {
            value: authDialogValue(type),
            type: type,
            cancelled: false
          }
        };
        return obj;
      }

      describe('_onAuthDialogResult()', function() {
        let element;
        beforeEach(async () => {
          element = await basicFixture();
          element.url = initUrl;
        });

        it('Processes the dialog results as basic', function() {
          const event = createAuthDialogEvent('basic');
          element._onAuthDialogResult(event);
          // just one of the changes made after calling base auth setter
          assert.ok(element._cache.basic[cleanUrl]);
        });

        it('Processes the dialog results as ntlm', function() {
          const event = createAuthDialogEvent('ntlm');
          element._onAuthDialogResult(event);
          // just one of the changes made after calling ntlm auth setter
          assert.ok(element._cache.ntlm[cleanUrl]);
        });
      });

      describe('_resendRequest()', function() {
        let element;
        beforeEach(async () => {
          element = await basicFixture();
          element.url = initUrl;
        });
        it('Fires resend-auth-request event', function() {
          const spy = sinon.spy();
          element.addEventListener('resend-auth-request', spy);
          element._resendRequest();
          assert.isTrue(spy.calledOnce);
        });
      });

      describe('_setNtlmAuthData()', function() {
        let element;
        beforeEach(async () => {
          element = await basicFixture();
          element.url = initUrl;
        });

        it('Caches the auth data', function() {
          const value = authDialogValue('ntlm');
          element._setNtlmAuthData(value);
          assert.equal(element._cache.ntlm[cleanUrl], value);
        });

        it('Fires ntlm-data-changed event', function() {
          const spy = sinon.spy();
          element.addEventListener('ntlm-data-changed', spy);
          const value = authDialogValue('ntlm');
          element._setNtlmAuthData(value);
          assert.isTrue(spy.calledOnce);
        });

        it('The ntlm-data-changed event contains auth settings', function(done) {
          const auth = {
            method: 'ntlm'
          };
          element.addEventListener('ntlm-data-changed', function(e) {
            assert.deepEqual(e.detail.value, auth);
            done();
          });
          const value = authDialogValue('ntlm');
          auth.username = value.username;
          auth.password = value.password;
          auth.domain = value.domain;
          element._setNtlmAuthData(value);
        });

        it('Fires resend-auth-request event', function() {
          const spy = sinon.spy();
          element.addEventListener('resend-auth-request', spy);
          const value = authDialogValue('ntlm');
          element._setNtlmAuthData(value);
          assert.isTrue(spy.calledOnce);
        });
      });

      describe('_setBasicAuthData()', function() {
        let element;
        beforeEach(async () => {
          element = await basicFixture();
          element.url = initUrl;
        });

        it('Caches the auth data', function() {
          const value = authDialogValue('basic');
          element._setBasicAuthData(value);
          assert.equal(element._cache.basic[cleanUrl], value);
        });

        it('Fires request-header-changed event', function() {
          const spy = sinon.spy();
          element.addEventListener('request-header-changed', spy);
          const value = authDialogValue('basic');
          element._setBasicAuthData(value);
          assert.isTrue(spy.calledOnce);
        });

        it('The request-header-changed event contains header details', function(done) {
          const headerName = 'authorization';
          const headerValue = 'Basic dGVzdDp0ZXN0';
          element.addEventListener('request-header-changed', function(e) {
            assert.equal(e.detail.name, headerName, 'Header name is ok');
            assert.equal(e.detail.value, headerValue, 'Header value is ok');
            done();
          });
          const value = authDialogValue('basic');
          element._setBasicAuthData(value);
        });

        it('Fires resend-auth-request event', function() {
          const spy = sinon.spy();
          element.addEventListener('resend-auth-request', spy);
          const value = authDialogValue('basic');
          element._setBasicAuthData(value);
          assert.isTrue(spy.calledOnce);
        });
      });

      describe('_storeAuthData()', function() {
        let element;
        function getRandomInt(min, max) {
          min = Math.ceil(min);
          max = Math.floor(max);
          return Math.floor(Math.random() * (max - min)) + min;
        }
        beforeEach(async () => {
          element = await basicFixture();
          element.url = cleanUrl + getRandomInt(1000, 2000) + '/';
        });
        it('Stores auth data for basic', function() {
          return element._storeAuthData('basic', basicObj);
        });

        it('Stores auth data for ntlm', function() {
          return element._storeAuthData('ntlm', authObj);
        });
      });

      describe('_restoreBasicData()', () => {
        let element;
        let doc;
        beforeEach(async () => {
          element = await basicFixture();
          element.url = 'http://domain.com';
          element._openBasicAuthDialog(element.url);
          doc = {
            username: 'test',
            password: 'pwd'
          };
        });

        it('Sets username', () => {
          element._restoreBasicData(doc);
          const dialog = element.dialog;
          assert.equal(dialog.username, doc.username);
        });

        it('Sets password', () => {
          element._restoreBasicData(doc);
          const dialog = element.dialog;
          assert.equal(dialog.password, doc.password);
        });
      });

      describe('_restoreNtlmData()', () => {
        let element;
        let doc;
        beforeEach(async () => {
          element = await basicFixture();
          element.url = 'http://domain.com';
          element._openNtlmAuthDialog(element.url);
          doc = {
            username: 'test',
            password: 'pwd',
            domain: 'my-domain'
          };
        });

        it('Sets username', () => {
          element._restoreNtlmData(doc);
          const dialog = element.dialog;
          assert.equal(dialog.username, doc.username);
        });

        it('Sets password', () => {
          element._restoreNtlmData(doc);
          const dialog = element.dialog;
          assert.equal(dialog.password, doc.password);
        });

        it('Sets domain', () => {
          element._restoreNtlmData(doc);
          const dialog = element.dialog;
          assert.equal(dialog.domain, doc.domain);
        });
      });

      describe('_setRestoredAuthData()', () => {
        let element;
        beforeEach(async () => {
          element = await basicFixture();
          element.url = 'http://domain.com';
        });

        it('Calls _restoreBasicData()', () => {
          element._openBasicAuthDialog(element.url);
          const spy = sinon.spy(element, '_restoreBasicData');
          element._setRestoredAuthData('basic', {});
          assert.isTrue(spy.called);
        });

        it('Calls _restoreNtlmData()', () => {
          element._openNtlmAuthDialog(element.url);
          const spy = sinon.spy(element, '_restoreNtlmData');
          element._setRestoredAuthData('ntlm', {});
          assert.isTrue(spy.called);
        });
      });
    });

    describe('_applyRequestBasicAuthData()', () => {
      let element;
      beforeEach(async () => {
        element = await basicFixture();
        element.url = 'http://domain.com';
      });

      it('Dispatches request-headers-changed', () => {
        const spy = sinon.spy();
        element.addEventListener('request-headers-changed', spy);
        element._applyRequestBasicAuthData({}, {
          hash: 'test'
        });
        assert.isTrue(spy.called);
        assert.equal(spy.args[0][0].detail.value, 'authorization: Basic test');
      });

      it('Does nothing if value did not changed', () => {
        const spy = sinon.spy();
        element.addEventListener('request-headers-changed', spy);
        element._applyRequestBasicAuthData({
          headers: 'authorization: Basic test'
        }, {
          hash: 'test'
        });
        assert.isFalse(spy.called);
      });
    });
  });

  describe('before-request event', () => {
    const initHeaders = 'x-token: abc';
    const initUrl = 'http://domain.com/?c=d';
    const initUrlClean = 'http://domain.com/';

    function fire(name, detail, node) {
      const e = new CustomEvent(name, {
        bubbles: true,
        cancelable: true,
        detail: detail
      });
      (node || document.body).dispatchEvent(e);
      return e;
    }

    function beforeRequestEvent(headers, node) {
      headers = headers || initHeaders;
      return fire('before-request', {
        url: initUrl,
        method: 'GET',
        headers: headers,
        promises: [],
        reason: undefined,
        auth: undefined,
        id: 'test-id'
      }, node);
    }

    const authObj = {
      username: 'test',
      password: 'test',
      domain: 'domain.com',
      method: 'ntlm'
    };

    const basicObj = {
      username: 'test',
      password: 'test',
      hash: 'dGVzdDp0ZXN0'
    };

    let element;
    beforeEach(async () => {
      element = await basicFixture();
    });

    it('Should not cancel the event', function() {
      const e = beforeRequestEvent();
      assert.isFalse(e.defaultPrevented);
    });

    it('Should not alter the request header', function() {
      const e = beforeRequestEvent();
      assert.equal(e.detail.headers, initHeaders);
    });

    it('Do not set auth data', function() {
      const e = beforeRequestEvent();
      assert.isUndefined(e.detail.auth);
    });

    it('Sets authorization header', function() {
      element._cache = {
        basic: {}
      };
      element._cache.basic[initUrlClean] = basicObj;
      const e = beforeRequestEvent();
      assert.notEqual(e.detail.headers.indexOf('authorization'), -1);
    });

    it('Dispatches request-headers-changed custom event', function(done) {
      element._cacheAuthData('basic', initUrlClean, basicObj);
      element.addEventListener('request-headers-changed', function clb() {
        element.removeEventListener('request-headers-changed', clb);
        done();
      });
      beforeRequestEvent();
    });

    it('Should set auth data', function() {
      element._cache = {
        ntlm: {}
      };
      element._cache.ntlm[initUrlClean] = authObj;
      const event = beforeRequestEvent();
      assert.deepEqual(event.detail.auth, authObj);
    });

    it('Should not alter request headers if authorization is set', function() {
      element._cache = {
        basic: {}
      };
      element._cache.basic[initUrlClean] = basicObj;
      const headers = initHeaders + '\nauthorization: test';
      const event = beforeRequestEvent(headers);
      assert.equal(event.detail.headers, headers);
    });

    it('Should set auth data if authorization is set', function() {
      element._cache = {
        ntlm: {}
      };
      element._cache.ntlm[initUrlClean] = authObj;
      const headers = initHeaders + '\nauthorization: test';
      const event = beforeRequestEvent(headers);
      assert.isUndefined(event.detail.auth);
    });
  });

  describe('after-request tests', function() {
    let element;
    beforeEach(async () => {
      element = await basicFixture();
    });

    const initHeaders = 'x-token: abc';
    const initUrl = 'http://domain.com/?c=d';

    function fire(name, detail, node) {
      const e = new CustomEvent(name, {
        bubbles: true,
        cancelable: true,
        detail: detail
      });
      (node || document.body).dispatchEvent(e);
      return e;
    }

    function createResponse(authType, status, statusText) {
      status = status || 401;
      statusText = statusText || 'Authorization required';
      let headers = 'x-token: abc\n';
      if (authType === 'ntlm') {
        headers += 'www-authenticate: ntlm';
      } else if (authType === 'basic') {
        headers += 'www-authenticate: basic';
      }
      return {
        status,
        statusText,
        headers
      };
    }

    function createRequest() {
      return {
        url: initUrl,
        headers: initHeaders,
        method: 'GET'
      };
    }

    function afterRequestEvent(authType, status, text) {
      return fire('api-response', {
        request: createRequest(),
        response: createResponse(authType, status, text),
        auth: undefined,
        isError: false,
        id: 'test'
      });
    }

    it('Open basic dialog', function(done) {
      element.addEventListener('iron-overlay-opened', function() {
        assert.equal(element.dialog.nodeName, 'AUTH-DIALOG-BASIC', 'Dialog is auth-dialog-basic');
        assert.isTrue(element.dialog.opened, 'Dialog is opened');
        done();
      });
      afterRequestEvent('basic');
    });

    it('Open ntlm dialog', function(done) {
      element.addEventListener('iron-overlay-opened', function() {
        assert.equal(element.dialog.nodeName, 'AUTH-DIALOG-NTLM', 'Dialog is auth-dialog-ntlm');
        assert.isTrue(element.dialog.opened, 'Dialog is opened');
        done();
      });
      afterRequestEvent('ntlm');
    });

    it('Do not opens the dialog for unknown type', function(done) {
      afterRequestEvent('unknown');
      setTimeout(function() {
        assert.equal(element.dialog, null);
        done();
      }, 300);
    });
  });
});
