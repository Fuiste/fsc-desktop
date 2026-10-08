# provenance

fsc desktop ports the behavior of Fuiste/frame-snip-cli, inspected at commit
db051c1b2bd8c95443ee4f358a3a406731280baa (package version 0.2.0).

the rendering engine uses exposure-watermark 0.2.0, with sharp 0.35.5 and
effect 3.22.2 overrides to address advisories affecting the original dependencies.
ordinary framing and panorama buffers are checked against that library in the
test suite. the desktop layer, safe output handling, orientation normalization,
and missing-metadata matte fallback are additions.

third-party dependencies retain their respective licenses. distribution includes
electron's license and chromium notices alongside the executable. the repository
contains generated sample artwork only, not personal photographs or catalogs.
