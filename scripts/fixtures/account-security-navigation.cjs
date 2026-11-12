const router = { push: value => { document.documentElement.dataset.navigation = value; }, replace: value => { document.documentElement.dataset.navigation = value; }, refresh() {} };
exports.useRouter = () => router;
exports.useSearchParams = () => new URLSearchParams(location.search);
