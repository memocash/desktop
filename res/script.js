(() => {
    const $form = document.getElementById("form-server")
    const $server = document.getElementById("form-server-server")
    const $response = document.getElementById("server-response")
    $response.innerHTML = ""
    $form.onsubmit = function () {
        const url = $server.value;
        fetch(url)
            .then(res => res.text())
            .then(res => {
                $response.innerHTML = res
            })
            .catch(err => {
                alert("error connecting to server:\n" + err)
            })
        $response.innerHTML = "Requesting server response..."
        return false;
    };
})();
