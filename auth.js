function goToHomepage() {
  window.location.href = "index.html";
}

function getCredentials() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value.trim();
  return { email, password };
}

function login() {
  const { email, password } = getCredentials();

  if (!email || !password) {
    alert("Please enter both email and password.");
    return;
  }

  goToHomepage();
}

function register() {
  const { email, password } = getCredentials();

  if (!email || !password) {
    alert("Please provide an email and password to register.");
    return;
  }

  alert("Registration successful. You may now continue to RoadWatch PH.");
  goToHomepage();
}

function googleLogin() {
  alert("Google sign-in is not configured yet. Redirecting to homepage.");
  goToHomepage();
}
