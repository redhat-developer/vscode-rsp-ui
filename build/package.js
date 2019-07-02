function clean() {
    return Promise.resolve();
}

Promise.resolve()
    .then(clean)
    .catch((err)=>{ throw err; });
