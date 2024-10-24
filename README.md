# RTMP Implementation Nodejs Typescript ![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white) ![NodeJS](https://img.shields.io/badge/Node.js-339933?logo=Node.js&logoColor=white)
Enhanced RTMP (FourCC) server implementation in nodejs and typescript with HLS and MPEG-DASH

# Build and usage
clone and npm run watch and on a seperate terminal npm run dev
# Usage with obs or any broadcasting software
use custom stream. 
put `rtmp://localhost/live` as server url and stream key = `username?key=anykey`
use h264, hevc encoder with aac sound proile for best compatiblity as of now.
## Accessing the HLS/Dash streams
- if you have safari then you can directly access the stream at `https://localhost:443/live/username/index.m3u8` since safari supports HLS natively only with h264. doesnt support hevc natively
- you can access from VLC as well. just play stream on vlc put the url as `https://localhost:443/live/username/index.m3u8` and select play. VLC supports almost all codecs natively
- for dash use the url `https://localhost:443/live/username/index.mpd` . and use dash player for html5 video or play on VLC
- on chrome or anywhere else - you would need something like hls.js player or dash player to play hls/dash streams respectively. add the url inside the script.
you can stream on av1, vp9 as well but. but ffmpeg will mux the av1, vp9 streams to private streams because of compatibility and u cant read them. need to handle these codecs separately.
