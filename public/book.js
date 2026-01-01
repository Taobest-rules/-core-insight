// Handle upload
const uploadForm = document.getElementById("uploadForm");
if (uploadForm) {
  uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("title").value;
    const description = document.getElementById("description").value;
    const price = document.getElementById("priceField")?.value;

    const res = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, price }),
    });

    const data = await res.json();
    if (data.error) {
      alert(data.error);
    } else {
      alert("Book uploaded!");
      loadBooks();
    }
  });
}

// Load books
async function loadBooks() {
  const res = await fetch("/api/books");
  const books = await res.json();

  const container = document.getElementById("booksList");
  if (container) {
    container.innerHTML = books
      .map(
        (b) =>
          `<div class="book">
            <h3>${b.title}</h3>
            <p>${b.description}</p>
            <p><strong>Price:</strong> ${b.price}</p>
            <small>Uploaded by: ${b.uploadedBy}</small>
          </div>`
      )
      .join("");
  }
}

loadBooks();
