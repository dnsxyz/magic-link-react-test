import { useEffect, useState } from "react";

import { Magic } from "magic-sdk";
import { OAuthExtension } from "@magic-ext/oauth";

import { MAGIC_PUBLIC_KEY } from "./config";

import "./App.css";

const MAGIC_API_KEY = MAGIC_PUBLIC_KEY;

const PROVIDER = "google";

const magicAuth = new Magic(MAGIC_API_KEY, {
  extensions: [new OAuthExtension()],
});


const LOGIN_PROVIDER = [
  "google",
  "facebook",
  "apple",
  "github",
  "bitbucket",
  "gitlab",
  "linkedin",
  "twitter",
  "discord",
  "twitch",
  "microsoft",
];


function App() {
  const [user, setUser] = useState(null);

  const handleLoginWithRedirect = async () => {
    await magicAuth.oauth.loginWithRedirect({
      provider: PROVIDER,
      redirectURI: window.location.href,
    });
  }
  const handleLogout = async () => {
    await magicAuth.user.logout();
    setUser(null);
  }

  useEffect(() => {
    let provider = new URLSearchParams(window.location.search).get("provider");
    
    if(provider){
      console.log("provider in search params:", provider);

      magicAuth.oauth.getRedirectResult().then((userInfo) => {
        console.log("processed oauth for", userInfo.magic.userMetadata.email);
        setUser(userInfo.magic.userMetadata);
      }
      ).catch((err)=>{
        console.log("getRedirectResult error");
        console.error(err);
      });
    }

    magicAuth.user.isLoggedIn().then((isLoggedIn)=>{
      console.log("logged in:", isLoggedIn);

      if (isLoggedIn) {
        // probably want to save in local storage or something persistant
        magicAuth.user.getMetadata().then((userInfo)=>{
          console.log("set user:", userInfo);
  
          setUser(userInfo);
        });

      } else {
        setUser(null);
      }
    }).catch();
    
    
  }, []);

  

  return (
    <div className="App">
      <div>
        Available Login Methods:
        <pre>{Object.values(LOGIN_PROVIDER).join("\n")}</pre>
      </div>
      {user === undefined ? (
        <>Loading</>
      ) : !user ? (
        <>
          <div>Please login with {PROVIDER}</div>
          <button
            onClick={handleLoginWithRedirect}
          >
            Login
          </button>
        </>
      ) : (
        <div>
          <div>You are signed in as <strong>{user.email}</strong></div>
          <div>You wallet address is <strong>{user.publicAddress}</strong></div>
          
          <button
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
