self.addEventListener("push", (event) => {
  let payload = { title: "Ops Monitor", body: "" };
  try {
    payload = event.data ? event.data.json() : payload;
  } catch {
    payload.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Ops Monitor", {
      body: payload.body || "",
      icon: "/icon.png",
      badge: "/icon.png",
      data: payload,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
