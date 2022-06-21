# mfe-okta

This module enables Micro-Frontends to retrieve an auth code from Okta in the background, and if that fails fall back to other methods.

One problem with Micro-Frontends that call secure APIs is that they require a token. If an MFE is reusable and used in multiple host apps, the host app token or auth mechanism may not also work for the MFE. The MFE will likely need to request its own auth code to pass to its own BFF, which will be exchanged for a token and stored in the BFF.

This module simplifies that pattern, and enables a host to offer that functionality to MFEs. The reason the host should do this is so that an MFE doesn't decide on its own to redirect out of a SPA and lose state, for example. The host app must be able to preserve its own state during an auth code redirect.

## Example Usage

### Host App

```javascript
import useOktaAuthCode from 'mfe-okta';

const App = ()=> {
  let [getAuthCode, redirectState] = useOktaAuthCode({
    
    // log messages to console for debugging
    debug: true,
    
    // This method allows the host to set a "state" identifier.
    // If a full-page Okta redirect happens, this state will be
    // passed back in so the host all can restore the state and UI.
    // It is passed the config object passed in by the MFE.
    getState: (callerConfig) => {
      return "STATE-EXAMPLE";
    },
    
    // The redirectUri to pass to Okta. This is the default value
    // computed, but you should set it to whatever your app needs.
    redirectUri: window.location.origin + window.location.pathname,
    
    // The scopes to request. Since we are only getting an auth code,
    // openid is sufficient but is configurable just in case.
    scopes:['openid'],
    
    // Methods to use to try to get an auth code (tried in this order).
    // useBackground==token.getWithoutPrompt() from the SDK.
    // This requires 3rd-party cookies if your auth server is on a
    // different domain than your app, and will fail in Safari.
    // usePopupFallback==token.getWithPopup() from the SDK.
    // This causes a popup to open and then close. It avoids a full-page
    // redirect but is not very user-friendly.
    // useRedirectFallback==token.getWithRedirect() from the SDK.
    // This should always work as a fallback. Your app must compute its 
    // state and also be written to support coming back into the app and
    // restoring its state.
    useBackground: true,
    usePopupFallback: false,
    useRedirectFallback: true
  });
  
  // If a full-page redirect has happened and the user is coming back
  // into the app, redirectState will be set to the state you passed in.
  // The auth code that was passed in from Okta will be parsed from the url
  // and stored so when the MFE requests it again (since the app is being
  // rendered for the first time again) the module will pass it back.
  if (redirectState) {
    // Restore the state!
    // Pseudo-code, just an example:
    stateManager.setState(redirectState);
    navigate(routes[stateManager.getCurrentState()]);
  }

  // Pass the getAuthCode method to the MFE to call
  return <MFEComponent getAuthCode={getAuthCode}/>;
}
```

### MFE

```javascript
const MFEComponent = (props)=>{
  let [authCode,setAuthCode] = React.useState(null);
  React.useEffect(async()=>{
    // On initial load, retrieve an auth code from the host so we can call our API.
    // Must pass in your authorization server url and clientId.
    let authCode = await props.getAuthCode({
      issuer:'https://okta.mysite.com/oauth2/default',
      clientId: '000000000000'
    });
    setAuthCode(authCode);
    // Now send auth code to our BFF so it can get a token
  },[]);
}
```