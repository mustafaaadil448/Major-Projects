(() => {
    const initMap = () => {
        if (typeof mapboxgl === "undefined") {
            window.addEventListener("load", initMap, { once: true });
            return;
        }
        if (!mapToken || typeof mapToken !== "string") return;
        if (!listing?.geometry?.coordinates || !Array.isArray(listing.geometry.coordinates)) return;
        if (listing.geometry.coordinates.length < 2) return;

        mapboxgl.accessToken = mapToken;
        const map = new mapboxgl.Map({
            container: "map",
            style: "mapbox://styles/mapbox/streets-v12",
            center: listing.geometry.coordinates,
            zoom: 9,
        });

        map.on("error", (e) => {
            const container = map.getContainer();
            if (!container || container.querySelector(".map-error")) return;

            const overlay = document.createElement("div");
            overlay.className = "map-error";
            overlay.textContent =
                "Map could not load (api.mapbox.com unreachable). Check internet/DNS, VPN/proxy, or adblock.";
            container.style.position = container.style.position || "relative";
            overlay.style.position = "absolute";
            overlay.style.inset = "0";
            overlay.style.display = "flex";
            overlay.style.alignItems = "center";
            overlay.style.justifyContent = "center";
            overlay.style.padding = "12px";
            overlay.style.textAlign = "center";
            overlay.style.background = "rgba(255,255,255,0.9)";
            overlay.style.color = "#222";
            overlay.style.fontSize = "14px";
            overlay.style.zIndex = "10";
            container.appendChild(overlay);
        });

        new mapboxgl.Marker({ color: "red" })
            .setLngLat(listing.geometry.coordinates)
            .setPopup(
                new mapboxgl.Popup({ offset: 25 }).setHTML(
                    `<h4>${listing.title}</h4><p>Exact Location will be provided after booking</p>`
                )
            )
            .addTo(map);
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initMap);
    } else {
        initMap();
    }
})();

