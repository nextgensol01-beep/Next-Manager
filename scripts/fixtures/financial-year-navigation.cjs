exports.useParams = () => ({ clientId: location.pathname.split("/").at(-1) });
exports.useRouter = () => ({
  push: (url) => {
    (window.fixtureNavigations ||= []).push(url);
  },
  replace: (url) => {
    (window.fixtureNavigations ||= []).push(url);
  },
  refresh() {},
  back() {},
});
exports.useSearchParams = () => new URLSearchParams(location.search);
exports.usePathname = () => location.pathname;
