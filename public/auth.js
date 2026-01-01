// Toggle password visibility
function togglePassword(id) {
  const field = document.getElementById(id);
  field.type = field.type === "password" ? "text" : "password";
}

// Handle signup
const signupForm = document.getElementById("signupForm");
if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("signupUsername").value;
    const password = document.getElementById("signupPassword").value;

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      document.getElementById("signupMessage").textContent = data.error
        ? "❌ " + data.error
        : "✅ " + data.message;
    } catch (err) {
      console.error(err);
      document.getElementById("signupMessage").textContent = "⚠️ Signup failed";
    }
  });
}

// Handle login
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("loginUsername").value;
    const password = document.getElementById("loginPassword").value;

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      document.getElementById("loginMessage").textContent = data.error
        ? "❌ " + data.error
        : "✅ " + data.message;

      if (!data.error) {
        localStorage.setItem("user", JSON.stringify(data.user)); // save user
        window.location.href = "dashboard.html"; // redirect after login
      }
    } catch (err) {
      console.error(err);
      document.getElementById("loginMessage").textContent = "⚠️ Login failed";
    }
  });
}

// Handle logout
async function logout() {
  try {
    await fetch("/api/logout", { method: "POST" });
    localStorage.removeItem("user");
    window.location.href = "login.html";
  } catch (err) {
    console.error(err);
  }
}
