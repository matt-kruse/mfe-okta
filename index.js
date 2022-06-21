import {OktaAuth} from '@okta/okta-auth-js';

let urlParsed = false;
// Auth code is an object keyed by clientId, to allow for multiple auth codes to be stored
let authCodes = {};
let redirectState = null;

const hookConfig = {
  // Where to redirect after a full page okta redirect
  redirectUri: window.location.origin + window.location.pathname,
  // A function to get the current app state upon redirect
  getState: null,
  // Which scopes to request
  scopes: ['openid'],
  // Try to use the background method to get an auth token?
  useBackground: true,
  // Fallback method to get auth code when token.getWithoutPrompt() fails
  usePopupFallback: true,
  useRedirectFallback: true,
  // Set true for debug logging
  debug: false
};

const debug = (a,b)=>{
  if (hookConfig.debug) console.log(a,b);
};

// Check to see if we are returning from Okta with an auth code in the url
const handleRedirect = ()=>{
  if (!urlParsed) {
    urlParsed = true;
    if (/#code=/.test(window.location.hash)) {
      // We don't want to call token.parseFromUrl() because that automatically
      // requests tokens using the auth code.
      // So we will get the parameters manually
      const urlParams = new URLSearchParams(window.location.hash.substring(1));
      let stateParameter = urlParams.get('state');
      // state will be in the format "key,state" because we need to know which
      // key to store the auth code under
      if (/,/.test(stateParameter)) {
        let [clientId, state] = stateParameter.split(",");
        redirectState = state;
        authCodes[clientId] = urlParams.get('code');
        // Reset the hash so the code is not visible
        window.location.hash = '';
      }
    }
  }
}
handleRedirect();

// This method can be called to get an Okta Auth Code.
// It will first try to do it silently in the background, and if that fails
// then try to use the fallback method(s)
// The MFE must pass
// {
//   issuer: <authserver url>,
//   clientId: <app client id>,
// }
const getAuthCode = async (config = {}) => {
  const issuer = config.issuer;
  if (!issuer) {
    throw "issuer attribute not found in config passed to getAuthCode()";
  }
  const clientId = config.clientId;
  if (!clientId) {
    throw "clientId attribute not found in config passed to getAuthCode()";
  }

  // If the authCode has been returned from a redirect, return it immediately.
  // Since a host app may have multiple MFEs with their own Auth codes, key them
  // by clientId.
  if (authCodes[clientId]) {
    return authCodes[clientId];
  }

  // Default Okta Config
  const oktaAuth = new OktaAuth({
    issuer: issuer,
    clientId: clientId,
    redirectUri: hookConfig.redirectUri,
    devMode: hookConfig.debug,
    responseType: 'code',
    pkce: false
  });

  // First try to get in the background. Safari will fail because of 3rd party
  // cookies *IF* the auth server is on a different domain from host app.
  if (hookConfig.useBackground) {
    try {
      debug("Calling token.getWithoutPrompt()");
      const json = await oktaAuth.token.getWithoutPrompt({
        prompt: 'none',
        scopes: hookConfig.scopes
      });
      oktaAuth.code = json.code;
      debug("Got auth code", oktaAuth.code);
      authCodes[clientId] = oktaAuth.code;
      return oktaAuth.code;
    } catch (e) {
      debug("Couldn't retrieve Okta auth code in the background");
    }
  }

  // Fallback - POPUP?
  if (hookConfig.usePopupFallback) {
    try {
      debug("Calling token.getWithPopup()");
      const json = await oktaAuth.token.getWithPopup({
        prompt: 'none',
        scopes: hookConfig.scopes
      });
      oktaAuth.code = json.code;
      debug("Got auth code", oktaAuth.code);
      authCodes[clientId] = oktaAuth.code;
      return oktaAuth.code;
    } catch(e) {
      debug("Couldn't retrieve Okta auth code with popup");
    }
  }

  // Fallback - REDIRECT?
  if (hookConfig.useRedirectFallback) {
    debug("Redirecting to Okta");
    // This lets the App calculate its state at redirect-time, so it can
    // return to the correct state
    let state = "";
    if (typeof hookConfig.getState==="function") {
      state = hookConfig.getState(config);
    }

    // Do a full page redirect and get the auth code from the url
    oktaAuth.token.getWithRedirect({
      response_type: 'code',
      state: clientId+","+state,
      scopes: hookConfig.scopes,
      responseMode: 'fragment' // so code will be passed in hash
    })
    .catch(function (err) {
      // handle AuthSdkError (AuthSdkError will be thrown if app is in OAuthCallback state)
      debug("AuthSDK Error calling token.getWithRedirect");
      debug(err);
      throw err;
    });
  }

  // If we get here, nothing worked. Let the app know.
  throw "Failure retrieving auth code - all fallbacks failed.";
};

// Provide a hook for components to use to expose functionality
const useOktaAuthCode = (config={}) => {
  Object.assign(hookConfig,config);
  return [getAuthCode,redirectState];
};

export default useOktaAuthCode;


