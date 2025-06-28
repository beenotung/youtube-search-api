/* stub of axios, actually using fetch */
const axios = {
  async get(url: string) {
    let res = await fetch(url)
    if (res.headers.get('content-type')?.includes('json')) {
      return { data: await res.json() }
    } else {
      return { data: await res.text() }
    }
  },
  async post(url: string, data: any) {
    let res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
    if (res.headers.get('content-type')?.includes('json')) {
      return { data: await res.json() }
    } else {
      return { data: await res.text() }
    }
  },
}

async function getHTML(url: string) {
  let res = await fetch(url)
  if (!res.ok) {
    throw new Error(
      `failed to GET html content, url: ${url} status: ${res.statusText || res.status}`,
    )
  }
  let html = await res.text()
  return html
}

const youtubeEndpoint = `https://www.youtube.com`

export type YoutubeListItem = {
  /** e.g. 'aZ9-35Gmt5k' */
  id?: string
  type?: 'video' | 'channel' | 'playlist' | 'movie'
  thumbnail?: {
    thumbnails: {
      url: string
      width: number
      height: number
    }[]
  }
  title?: string
  /** e.g. 'Birder King' */
  channelTitle?: string
  shortBylineText?: {
    runs: {
      /** e.g. 'Birder King' */
      text: string
      navigationEndpoint: {
        commandMetadata: {
          webCommandMetadata: {
            /** e.g. '/@BirderKing' */
            url: string
            /** e.g. 'WEB_PAGE_TYPE_CHANNEL' */
            webPageType: string
          }
        }
      }
    }[]
  }
  /** empty string if is live */
  length?:
    | ''
    | {
        accessibility: {
          accessibilityData: {
            /** e.g. '15 分鐘' */
            label: string
          }
        }
        /** e.g. '15:00' */
        simpleText: string
      }
  videos?: YoutubeSearchResult | YoutubeAPI.GetPlaylistResult['initialData']
  videoCount?: number
  isLive?: boolean
}

export type YoutubeSearchResultNextPage = {
  nextPageToken: string
  nextPageContext: {
    context: {
      client: {
        /** e.g. 'zh-HK' */
        hl: string
        /** e.g. 'HK' */
        gl: string
      }
    }
    continuation?: string
  }
}

export type YoutubeSearchResult = {
  items: YoutubeListItem[]
  nextPage: YoutubeSearchResultNextPage
}

const GetYoutubeInitData = async (url: string) => {
  var apiToken = null
  var context = null
  const page = await axios.get(encodeURI(url))
  const ytInitData = page.data.split('var ytInitialData =')
  if (ytInitData && ytInitData.length > 1) {
    const data = ytInitData[1].split('</script>')[0].slice(0, -1)

    if (page.data.split('innertubeApiKey').length > 0) {
      apiToken = page.data
        .split('innertubeApiKey')[1]
        .trim()
        .split(',')[0]
        .split('"')[2]
    }

    if (page.data.split('INNERTUBE_CONTEXT').length > 0) {
      context = JSON.parse(
        page.data.split('INNERTUBE_CONTEXT')[1].trim().slice(2, -2),
      )
    }

    let initdata = JSON.parse(data)
    return { initdata, apiToken, context }
  } else {
    throw new Error('cannot_get_init_data')
  }
}

const GetYoutubePlayerDetail = async (url: string) => {
  const page = await axios.get(encodeURI(url))
  const ytInitData = page.data.split('var ytInitialPlayerResponse =')
  if (ytInitData && ytInitData.length > 1) {
    const data = ytInitData[1].split('</script>')[0].slice(0, -1)
    let initdata = JSON.parse(data)
    return { ...initdata.videoDetails }
  } else {
    throw new Error('cannot_get_player_data')
  }
}

export const GetListByKeyword = async (
  keyword: string,
  withPlaylist = false,
  limit = 0,
  options: { type: 'video' | 'channel' | 'playlist' | 'movie' }[] = [],
): Promise<YoutubeSearchResult> => {
  let endpoint = `${youtubeEndpoint}/results?search_query=${keyword}`
  if (Array.isArray(options) && options.length > 0) {
    const type = options.find(z => z.type)
    if (typeof type == 'object') {
      if (typeof type.type == 'string') {
        switch (type.type.toLowerCase()) {
          case 'video':
            endpoint = `${endpoint}&sp=EgIQAQ%3D%3D`
            break
          case 'channel':
            endpoint = `${endpoint}&sp=EgIQAg%3D%3D`
            break
          case 'playlist':
            endpoint = `${endpoint}&sp=EgIQAw%3D%3D`
            break
          case 'movie':
            endpoint = `${endpoint}&sp=EgIQBA%3D%3D`
            break
        }
      }
    }
  }
  const page = await GetYoutubeInitData(endpoint)

  const sectionListRenderer =
    page.initdata.contents.twoColumnSearchResultsRenderer.primaryContents
      .sectionListRenderer

  let contToken: string | undefined

  let items: YoutubeListItem[] = []

  sectionListRenderer.contents.forEach((content: any) => {
    if (content.continuationItemRenderer) {
      contToken =
        content.continuationItemRenderer.continuationEndpoint
          .continuationCommand.token
    } else if (content.itemSectionRenderer) {
      content.itemSectionRenderer.contents.forEach((item: any) => {
        if (item.channelRenderer) {
          let channelRenderer = item.channelRenderer
          items.push({
            id: channelRenderer.channelId,
            type: 'channel',
            thumbnail: channelRenderer.thumbnail,
            title: channelRenderer.title.simpleText,
          })
        } else {
          let videoRender = item.videoRenderer
          let playListRender = item.playlistRenderer

          if (videoRender && videoRender.videoId) {
            items.push(VideoRender(item))
          }
          if (withPlaylist) {
            if (playListRender && playListRender.playlistId) {
              items.push({
                id: playListRender.playlistId,
                type: 'playlist',
                thumbnail: playListRender.thumbnails,
                title: playListRender.title.simpleText,
                length: playListRender.videoCount,
                videos: playListRender.videos,
                videoCount: playListRender.videoCount,
                isLive: false,
              })
            }
          }
        }
      })
    }
  })
  const apiToken = page.apiToken
  const context = page.context
  const nextPageContext = { context, continuation: contToken }
  const itemsResult = limit != 0 ? items.slice(0, limit) : items
  return {
    items: itemsResult,
    nextPage: { nextPageToken: apiToken, nextPageContext: nextPageContext },
  }
}

export const NextPage = async (
  nextPage: YoutubeSearchResultNextPage,
  withPlaylist = false,
  limit = 0,
): Promise<YoutubeSearchResult> => {
  const endpoint = `${youtubeEndpoint}/youtubei/v1/search?key=${nextPage.nextPageToken}`
  const page = await axios.post(encodeURI(endpoint), nextPage.nextPageContext)
  const item1 =
    page.data.onResponseReceivedCommands[0].appendContinuationItemsAction
  let items: YoutubeListItem[] = []
  for (const conitem of item1.continuationItems) {
    if (conitem.itemSectionRenderer) {
      for (const item of conitem.itemSectionRenderer.contents) {
        let videoRender = item.videoRenderer
        let playListRender = item.playlistRenderer
        if (videoRender && videoRender.videoId) {
          items.push(VideoRender(item))
        }
        if (withPlaylist) {
          if (playListRender && playListRender.playlistId) {
            items.push({
              id: playListRender.playlistId,
              type: 'playlist',
              thumbnail: playListRender.thumbnails,
              title: playListRender.title.simpleText,
              length: playListRender.videoCount,
              videos: (await YoutubeAPI.getPlaylist(playListRender.playlistId))
                .initialData,
            })
          }
        }
      }
    } else if (conitem.continuationItemRenderer) {
      nextPage.nextPageContext.continuation =
        conitem.continuationItemRenderer.continuationEndpoint.continuationCommand.token
    }
  }
  const itemsResult = limit != 0 ? items.slice(0, limit) : items
  return { items: itemsResult, nextPage: nextPage }
}

export type YoutubeSuggestResult = {
  items: YoutubeListItem[]
}

export const GetSuggestData = async (
  limit = 0,
): Promise<YoutubeSuggestResult> => {
  const endpoint = `${youtubeEndpoint}`
  const page = await GetYoutubeInitData(endpoint)
  const sectionListRenderer =
    page.initdata.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer
      .content.richGridRenderer.contents
  let items: YoutubeListItem[] = []
  let otherItems: YoutubeListItem[] = []
  sectionListRenderer.forEach((item: any) => {
    if (item.richItemRenderer && item.richItemRenderer.content) {
      let videoRender = item.richItemRenderer.content.videoRenderer
      if (videoRender && videoRender.videoId) {
        items.push(VideoRender(item.richItemRenderer.content))
      } else {
        otherItems.push(videoRender)
      }
    }
  })
  const itemsResult = limit != 0 ? items.slice(0, limit) : items
  return { items: itemsResult }
}

export type YoutubeChannelResult = Array<{
  title: string /** e.g. "主頁" */
  content?: {
    sectionListRenderer: {
      contents: Array<{
        itemSectionRenderer: {
          contents: Array<{
            channelVideoPlayerRenderer?: {
              videoId: string /** e.g. "2xKf-zL-r4E" */
              title: {
                runs: Array<{
                  text: string /** e.g. "TRAIN DRIVER'S VIEW: Channel Trailer" */
                }>
                accessibility: {
                  accessibilityData: {
                    label: string /** e.g. "TRAIN DRIVER'S VIEW: Channel Trailer 55 秒" */
                  }
                }
              }
              description: {
                runs: Array<{
                  text: string /** e.g. "Welcome to my channel. I'm a female train driver/engineer working on the scenic Bergen Line and famous Flåm Railway in Norway.\nI'm bringing you my scenic view from the drivers cab from all seasons and weather in 4K.\n\nMy videos are without music and contains only the pure and raw sound of the engine itself. Enjoy!\n\n🚄Bergen Line information: " */
                }>
              }
              viewCountText: {
                simpleText: string /** e.g. "收看次數：52,710 次" */
              }
              publishedTimeText: {
                runs: Array<{
                  text: string /** e.g. "5 年前" */
                }>
              }
            }
            recognitionShelfRenderer?: {
              title: {
                simpleText: string /** e.g. "我們的會員" */
              }
              subtitle: {
                simpleText: string /** e.g. "各位頻道會員，感謝你！" */
              }
              avatars: Array<{
                thumbnails: Array<{
                  url: string /** e.g. "https://yt3.googleusercontent.com/ytc/AIdro_kpd-e1BKKuax4Ntjpm7bkfcUOr-V5qcGqclpd38rw=s88-c-k-c0x00ffffff-no-rj" */
                }>
              }>
            }
            shelfRenderer?: {
              title: {
                runs: Array<{
                  text: string /** e.g. "直播中" */
                  navigationEndpoint: {
                    commandMetadata?: {
                      webCommandMetadata: {
                        url: string /** e.g. "/@RailCowGirl/videos?view=2&sort=dd&live_view=501&shelf_id=2" */
                        webPageType: string /** e.g. "WEB_PAGE_TYPE_CHANNEL" */
                      }
                    }
                    browseEndpoint?: {
                      canonicalBaseUrl: string /** e.g. "/@RailCowGirl" */
                    }
                  }
                }>
              }
              content: {
                horizontalListRenderer: {
                  items: Array<{
                    gridVideoRenderer?: {
                      videoId: string /** e.g. "czoEAKX9aaM" */
                      thumbnail: {
                        thumbnails: Array<{
                          url: string /** e.g. "https://i.ytimg.com/vi/czoEAKX9aaM/hqdefault.jpg?v=6727db6c&sqp=-oaymwEiCKgBEF5IWvKriqkDFQgBFQAAAAAYASUAAMhCPQCAokN4AQ==&rs=AOn4CLCprwxkBHpZcd0XlIV0Cr7bAWM4jg" */
                          width: number /** e.g. 168 */
                          height: number /** e.g. 94 */
                        }>
                      }
                      title: {
                        accessibility: {
                          accessibilityData: {
                            label: string /** e.g. "The Best Of Norway's Railway WINTER Cab Views" */
                          }
                        }
                        simpleText: string /** e.g. "The Best Of Norway's Railway WINTER Cab Views" */
                      }
                      viewCountText: {
                        runs?: Array<{
                          text: string /** e.g. "198" */
                        }>
                        simpleText?: string /** e.g. "收看次數：76,886 次" */
                      }
                      ownerBadges: Array<{
                        metadataBadgeRenderer: {
                          icon: {
                            iconType: string /** e.g. "CHECK_CIRCLE_THICK" */
                          }
                          style: string /** e.g. "BADGE_STYLE_TYPE_VERIFIED" */
                          tooltip: string /** e.g. "已驗證" */
                          accessibilityData: {
                            label: string /** e.g. "已驗證" */
                          }
                        }
                      }>
                      thumbnailOverlays: Array<{
                        thumbnailOverlayTimeStatusRenderer?: {
                          text: {
                            runs?: Array<{
                              text: string /** e.g. "直播" */
                            }>
                            accessibility: {
                              accessibilityData: {
                                label: string /** e.g. "直播" */
                              }
                            }
                            simpleText?: string /** e.g. "1:36:59" */
                          }
                          style: string /** e.g. "LIVE" */
                          icon?: {
                            iconType: string /** e.g. "LIVE" */
                          }
                        }
                      }>
                      publishedTimeText?: {
                        simpleText: string /** e.g. "1 個月前" */
                      }
                    }
                    lockupViewModel?: {
                      contentImage: {
                        collectionThumbnailViewModel: {
                          primaryThumbnail: {
                            thumbnailViewModel: {
                              image: {
                                sources: Array<{
                                  url: string /** e.g. "https://i.ytimg.com/vi/NDrhzV8AccI/hqdefault.jpg?sqp=-oaymwEXCOADEI4CSFryq4qpAwkIARUAAIhCGAE=&rs=AOn4CLB_HxIshNuhT4aebKDMl3x8Y2v3QA" */
                                  width: number /** e.g. 480 */
                                  height: number /** e.g. 270 */
                                }>
                              }
                              overlays: Array<{
                                thumbnailOverlayBadgeViewModel?: {
                                  thumbnailBadges: Array<{
                                    thumbnailBadgeViewModel: {
                                      icon: {
                                        sources: Array<{
                                          clientResource: {
                                            imageName: string /** e.g. "PLAYLISTS" */
                                          }
                                        }>
                                      }
                                      text: string /** e.g. "57 部影片" */
                                    }
                                  }>
                                }
                              }>
                            }
                          }
                        }
                      }
                      metadata: {
                        lockupMetadataViewModel: {
                          title: {
                            content: string /** e.g. "Cab View Oslo - Bergen" */
                          }
                          metadata: {
                            contentMetadataViewModel: {
                              metadataRows: Array<{
                                metadataParts: Array<{
                                  text: {
                                    content: string /** e.g. "RailCowGirl" */
                                    commandRuns: Array<{
                                      startIndex: number /** e.g. 0 */
                                      length: number /** e.g. 11 */
                                    }>
                                  }
                                }>
                              }>
                            }
                          }
                        }
                      }
                      contentId: string /** e.g. "PLqVXtaI0Orw6z3e7q2fe16IE1KsPbbilZ" */
                      contentType: string /** e.g. "LOCKUP_CONTENT_TYPE_PLAYLIST" */
                    }
                    gridChannelRenderer?: {
                      channelId: string /** e.g. "UCeIU079SsB5QF7sW1XVbiuw" */
                      thumbnail: {
                        thumbnails: Array<{
                          url: string /** e.g. "//yt3.googleusercontent.com/fK2iaVBChrhzSfxe92Ee01bHEKVuCrlfoEOPvvwPOFNbq1uMZkC-ee5NwWO0cklsuJtpPZapJk0=s88-c-k-c0x00ffffff-no-rj-mo" */
                          width: number /** e.g. 88 */
                          height: number /** e.g. 88 */
                        }>
                      }
                      videoCountText: {
                        runs: Array<{
                          text: string /** e.g. "16" */
                        }>
                      }
                      subscriberCountText: {
                        accessibility: {
                          accessibilityData: {
                            label: string /** e.g. "989 位訂閱者" */
                          }
                        }
                        simpleText: string /** e.g. "989 位訂閱者" */
                      }
                      title: {
                        simpleText: string /** e.g. "RailCowBirds" */
                      }
                    }
                  }>
                }
              }
            }
            reelShelfRenderer?: {
              title: {
                runs: Array<{
                  text: string /** e.g. "Shorts" */
                }>
              }
              items: Array<{
                shortsLockupViewModel: {
                  entityId: string /** e.g. "shorts-shelf-item-NnOAn-70Pp0" */
                  accessibilityText: string /** e.g. "Flam Railway Fact  #cabview #FlamRailway #norway #cabview #Queenofslowtv #bergenline #chat, 收看次數：13K 次 - 播 Shorts" */
                  thumbnail: {
                    sources: Array<{
                      url: string /** e.g. "https://i.ytimg.com/vi/NnOAn-70Pp0/oar2.jpg?sqp=-oaymwEkCJUDENAFSFqQAgHyq4qpAxMIARUAAAAAJQAAyEI9AICiQ3gB&rs=AOn4CLDtqRoHzeHOqO_gtbAwKX9k9KRSQQ" */
                      width: number /** e.g. 405 */
                      height: number /** e.g. 720 */
                    }>
                  }
                  onTap: {
                    innertubeCommand: {
                      commandMetadata: {
                        webCommandMetadata: {
                          url: string /** e.g. "/shorts/NnOAn-70Pp0" */
                          webPageType: string /** e.g. "WEB_PAGE_TYPE_SHORTS" */
                        }
                      }
                      reelWatchEndpoint: {
                        videoId: string /** e.g. "NnOAn-70Pp0" */
                        thumbnail: {
                          thumbnails: Array<{
                            url: string /** e.g. "https://i.ytimg.com/vi/NnOAn-70Pp0/frame0.jpg" */
                            width: number /** e.g. 1080 */
                            height: number /** e.g. 1920 */
                          }>
                          isOriginalAspectRatio: boolean /** e.g. true */
                        }
                      }
                    }
                  }
                  overlayMetadata: {
                    primaryText: {
                      content: string /** e.g. "Flam Railway Fact  #cabview #FlamRailway #norway #cabview #Queenofslowtv #bergenline #chat" */
                    }
                    secondaryText: {
                      content: string /** e.g. "收看次數：13K 次" */
                    }
                  }
                }
              }>
            }
          }>
        }
      }>
    }
  }
}>

export const GetChannelById = async (
  channelId: string,
): Promise<YoutubeChannelResult> => {
  const endpoint = `${youtubeEndpoint}/channel/${channelId}`
  const page = await GetYoutubeInitData(endpoint)
  const tabs = page.initdata.contents.twoColumnBrowseResultsRenderer
    .tabs as any[]
  const items = tabs
    .map(json => {
      if (json && json.tabRenderer) {
        const tabRenderer = json.tabRenderer
        const title = tabRenderer.title
        const content = tabRenderer.content
        return { title, content }
      }
    })
    .filter(y => typeof y != 'undefined')
  return items
}

export const GetVideoDetails = async (videoId: string) => {
  const endpoint = `${youtubeEndpoint}/watch?v=${videoId}`
  const page = await GetYoutubeInitData(endpoint)
  const playerData = await GetYoutubePlayerDetail(endpoint)

  const result = page.initdata.contents.twoColumnWatchNextResults
  const firstContent =
    result.results.results.contents[0].videoPrimaryInfoRenderer
  const secondContent =
    result.results.results.contents[1].videoSecondaryInfoRenderer
  const res = {
    id: playerData.videoId,
    title: firstContent.title.runs[0].text,
    thumbnail: playerData.thumbnail,
    isLive: firstContent.viewCount.videoViewCountRenderer.hasOwnProperty(
      'isLive',
    )
      ? firstContent.viewCount.videoViewCountRenderer.isLive
      : false,
    channel:
      playerData.author ||
      secondContent.owner.videoOwnerRenderer.title.runs[0].text,
    channelId: playerData.channelId,
    description: playerData.shortDescription,
    keywords: playerData.keywords,
    suggestion: result.secondaryResults.secondaryResults.results
      .filter((y: any) => y.hasOwnProperty('compactVideoRenderer'))
      .map((x: any) => compactVideoRenderer(x)),
  }

  return res
}

const VideoRender = (json: any): YoutubeListItem => {
  if (json && (json.videoRenderer || json.playlistVideoRenderer)) {
    let videoRenderer = null
    if (json.videoRenderer) {
      videoRenderer = json.videoRenderer
    } else if (json.playlistVideoRenderer) {
      videoRenderer = json.playlistVideoRenderer
    }
    var isLive = false
    if (
      videoRenderer.badges &&
      videoRenderer.badges.length > 0 &&
      videoRenderer.badges[0].metadataBadgeRenderer &&
      videoRenderer.badges[0].metadataBadgeRenderer.style ==
        'BADGE_STYLE_TYPE_LIVE_NOW'
    ) {
      isLive = true
    }
    if (videoRenderer.thumbnailOverlays) {
      videoRenderer.thumbnailOverlays.forEach((item: any) => {
        if (
          item.thumbnailOverlayTimeStatusRenderer &&
          item.thumbnailOverlayTimeStatusRenderer.style &&
          item.thumbnailOverlayTimeStatusRenderer.style == 'LIVE'
        ) {
          isLive = true
        }
      })
    }
    const id = videoRenderer.videoId
    const thumbnail = videoRenderer.thumbnail
    const title = videoRenderer.title.runs[0].text
    const shortBylineText = videoRenderer.shortBylineText
      ? videoRenderer.shortBylineText
      : ''
    const lengthText = videoRenderer.lengthText ? videoRenderer.lengthText : ''
    const channelTitle =
      videoRenderer.ownerText && videoRenderer.ownerText.runs
        ? videoRenderer.ownerText.runs[0].text
        : ''
    return {
      id,
      type: 'video',
      thumbnail,
      title,
      channelTitle,
      shortBylineText,
      length: lengthText,
      isLive,
    }
  } else {
    return {}
  }
}

const compactVideoRenderer = (json: any) => {
  const compactVideoRendererJson = json.compactVideoRenderer

  var isLive = false
  if (
    compactVideoRendererJson.badges &&
    compactVideoRendererJson.badges.length > 0 &&
    compactVideoRendererJson.badges[0].metadataBadgeRenderer &&
    compactVideoRendererJson.badges[0].metadataBadgeRenderer.style ==
      'BADGE_STYLE_TYPE_LIVE_NOW'
  ) {
    isLive = true
  }
  const result = {
    id: compactVideoRendererJson.videoId,
    type: 'video',
    thumbnail: compactVideoRendererJson.thumbnail.thumbnails,
    title: compactVideoRendererJson.title.simpleText,
    channelTitle: compactVideoRendererJson.shortBylineText.runs[0].text,
    shortBylineText: compactVideoRendererJson.shortBylineText.runs[0].text,
    length: compactVideoRendererJson.lengthText,
    isLive,
  }
  return result
}

export const GetShortVideo = async () => {
  const page = await GetYoutubeInitData(youtubeEndpoint)
  const shortResult =
    page.initdata.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer.contents
      .filter((x: any) => {
        return x.richSectionRenderer
      })
      .map((z: any) => z.richSectionRenderer.content)
      .filter((y: any) => y.richShelfRenderer)
      .map((u: any) => u.richShelfRenderer)
      .find((i: any) => i.title.runs[0].text == 'Shorts')
  const res = shortResult.contents
    .map((z: any) => z.richItemRenderer)
    .map((y: any) => y.content.reelItemRenderer)
  return res.map((json: any) => ({
    id: json.videoId,
    type: 'reel',
    thumbnail: json.thumbnail.thumbnails[0],
    title: json.headline.simpleText,
    inlinePlaybackEndpoint: json.inlinePlaybackEndpoint || {},
  }))
}

export namespace YoutubeAPI {
  export type GetPlaylistResult = {
    initialData: {
      contents: {
        /* for videos */
        twoColumnBrowseResultsRenderer: {
          tabs: Array<{
            tabRenderer: {
              selected: boolean /** e.g. true */
              content: {
                sectionListRenderer: {
                  contents: Array<{
                    itemSectionRenderer?: {
                      contents: Array<{
                        playlistVideoListRenderer: {
                          contents: Array<{
                            playlistVideoRenderer: {
                              videoId: string /** e.g. "aircAruvnKk" */
                              thumbnail: {
                                thumbnails: Array<{
                                  url: string /** e.g. "https://i.ytimg.com/vi/aircAruvnKk/hqdefault.jpg?..." */
                                  width: number /** e.g. 168 */
                                  height: number /** e.g. 94 */
                                }>
                              }
                              title: {
                                runs: Array<{
                                  text: string /** e.g. "But what is a neural network? | Deep learning chapter 1" */
                                }>
                                accessibility: {
                                  accessibilityData: {
                                    label: string /** e.g. "But what is a neural network? | Deep learning chapter 1 18 分鐘" */
                                  }
                                }
                              }
                              index: {
                                simpleText: string /** e.g. "1" */
                              }
                              shortBylineText: {
                                runs: Array<{
                                  text: string /** e.g. "3Blue1Brown" */
                                  navigationEndpoint: {
                                    commandMetadata: {
                                      webCommandMetadata: {
                                        url: string /** e.g. "/channel/UCdIi8cjUtvHb1qLYo3AaY-Q" "/@3blue1brown" */
                                      }
                                    }
                                  }
                                }>
                              }
                              lengthText: {
                                simpleText: string /** e.g. "2:23" */
                              }
                              lengthSeconds: string /** e.g. "143" */
                              videoInfo: {
                                runs: Array<{
                                  text: string /** e.g. "收看次數：19M 次" */
                                }>
                              }
                            }
                          }>
                        }
                      }>
                    }
                  }>
                }
              }
            }
          }>
        }
      }
      /* for the playlist metadata */
      header: {
        playlistHeaderRenderer: {
          playlistId: string /** e.g. "OLAK5uy_mBNWxa3sp5GEDZaRdrtDd5DWEJzKb2rI4" */
          title: {
            simpleText: string /** e.g. "Bamboo Echoes Vol. 1: Zephyr and Ink (竹林迴響第一卷：風與墨)" */
          }
          numVideosText: {
            runs: Array<{
              text: string /** e.g. "10" */
            }>
          }
          viewCountText: {
            simpleText: string /** e.g. "收看次數：7,816,351 次" */
          }
          shareData: {
            canShare: boolean /** e.g. true */
          }
          privacy: string /** e.g. "PUBLIC" */
          stats: Array<{
            runs?: Array<{
              text: string /** e.g. "10" */
            }>
            simpleText?: string /** e.g. "收看次數：7,816,351 次" */
          }>
          briefStats: Array<{
            runs: Array<{
              text: string /** e.g. "10" */
            }>
          }>
          playlistHeaderBanner: {
            heroPlaylistThumbnailRenderer: {
              thumbnail: {
                thumbnails: Array<{
                  url: string /** e.g. "https://i9.ytimg.com/s_p/OLAK5uy_mBNWxa3sp5GEDZaRdrtDd5DWEJzKb2rI4/mqdefault.jpg?sqp=CMz8_sIGir7X7AMICN-A88IGEAE=&rs=AOn4CLCf4a-nkl9K1qogIbqZ104-digqfw&v=1750909023" */
                  width: number /** e.g. 180 */
                  height: number /** e.g. 180 */
                }>
                sampledThumbnailColor: {
                  red: number /** e.g. 61 */
                  green: number /** e.g. 89 */
                  blue: number /** e.g. 82 */
                }
                darkColorPalette: {
                  section2Color: number /** e.g. 1713699 */
                  iconInactiveColor: number /** e.g. 7376004 */
                  iconDisabledColor: number /** e.g. 4413779 */
                }
                vibrantColorPalette: {
                  iconInactiveColor: number /** e.g. 7051660 */
                }
              }
              maxRatio: number /** e.g. 0.5625 */
              trackingParams: string /** e.g. "CB4Qw-wJIhMI-vSXru-TjgMVBDZ7Bx1u2zxe" */
              onTap: {
                clickTrackingParams: string /** e.g. "CB4Qw-wJIhMI-vSXru-TjgMVBDZ7Bx1u2zxeWitWTE9MQUs1dXlfbUJOV3hhM3NwNUdFRFphUmRydERkNURXRUp6S2Iyckk0mgEDEPos" */
                commandMetadata: {
                  webCommandMetadata: {
                    url: string /** e.g. "/watch?v=jsHol-uCDHs&list=OLAK5uy_mBNWxa3sp5GEDZaRdrtDd5DWEJzKb2rI4&pp=8AUB" */
                    webPageType: string /** e.g. "WEB_PAGE_TYPE_WATCH" */
                    rootVe: number /** e.g. 3832 */
                  }
                }
                watchEndpoint: {
                  videoId: string /** e.g. "jsHol-uCDHs" */
                  playlistId: string /** e.g. "OLAK5uy_mBNWxa3sp5GEDZaRdrtDd5DWEJzKb2rI4" */
                  playerParams: string /** e.g. "8AUB" */
                  loggingContext: {
                    vssLoggingContext: {
                      serializedContextData: string /** e.g. "GilPTEFLNXV5X21CTld4YTNzcDVHRURaYVJkcnREZDVEV0VKektiMnJJNA%3D%3D" */
                    }
                  }
                  watchEndpointSupportedOnesieConfig: {
                    html5PlaybackOnesieConfig: {
                      commonConfig: {
                        url: string /** e.g. "https://rr2---sn-i5goxu-i3bl.googlevideo.com/initplayback?source=youtube&oeis=1&c=WEB&oad=3200&ovd=3200&oaad=11000&oavd=11000&ocs=700&oewis=1&oputc=1&ofpcc=1&msp=1&odepv=1&onvi=1&oreouc=1&id=8ec1e897eb820c7b&ip=175.159.0.179&initcwndbps=3907500&mt=1751104634&oweuc=&pxtags=Cg4KAnR4Egg1MTQ3ODMyMQ&rxtags=Cg4KAnR4Egg1MTQ3ODMyMA%2CCg4KAnR4Egg1MTQ3ODMyMQ%2CCg4KAnR4Egg1MTQ3ODMyMg" */
                      }
                    }
                  }
                }
              }
              thumbnailOverlays: {
                thumbnailOverlayHoverTextRenderer: {
                  text: {
                    simpleText: string /** e.g. "全部播放" */
                  }
                  icon: {
                    iconType: string /** e.g. "PLAY_ALL" */
                  }
                }
              }
            }
          }
          subtitle: {
            simpleText: string /** e.g. "MoodEchoes BGM • 專輯" */
          }
          byline: Array<{
            playlistBylineRenderer: {
              text: {
                runs?: Array<{
                  text: string /** e.g. "10" */
                }>
                simpleText?: string /** e.g. "收看次數：0 次" */
              }
            }
          }>
        }
      }
      /* for the playlist metadata */
      metadata: {
        playlistMetadataRenderer: {
          title: string /** e.g. "Bamboo Echoes Vol. 1: Zephyr and Ink (竹林迴響第一卷：風與墨)" */
          description?: string /** e.g. "Learn the basics of neural networks and backpropagation, one of the most important algorithms for the modern world." */
          androidAppindexingLink: string /** e.g. "android-app://com.google.android.youtube/http/www.youtube.com/playlist?list=OLAK5uy_mBNWxa3sp5GEDZaRdrtDd5DWEJzKb2rI4" */
          iosAppindexingLink: string /** e.g. "ios-app://544007664/vnd.youtube/www.youtube.com/playlist?list=OLAK5uy_mBNWxa3sp5GEDZaRdrtDd5DWEJzKb2rI4" */
          /* below fields only available in album playlist */
          playUrl?: string /** e.g. "www.youtube.com/playlist?list=OLAK5uy_mBNWxa3sp5GEDZaRdrtDd5DWEJzKb2rI4" */
          androidPlayUrl?: string /** e.g. "android-app://com.google.android.youtube/http/www.youtube.com/playlist?list=OLAK5uy_mBNWxa3sp5GEDZaRdrtDd5DWEJzKb2rI4" */
          albumName?: string /** e.g. "Bamboo Echoes Vol. 1: Zephyr and Ink (竹林迴響第一卷：風與墨)" */
        }
      }
      microformat: {
        microformatDataRenderer: {
          urlCanonical: string /** e.g. "http://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi" */
          title: string /** e.g. "Neural networks" */
          description: string /** e.g. "Learn the basics of neural networks and backpropagation, one of the most important algorithms for the modern world." */
          thumbnail: {
            thumbnails: Array<{
              url: string /** e.g. "https://i9.ytimg.com/s_p/PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi/landscape_mqdefault.jpg?sqp=CKyP_8IGir7X7AMICNGyiNsFEAE=&rs=AOn4CLAwxt6EqoBfqi-ThrGoFcHnjN3HSQ&v=1533155665&days_since_epoch=20267" */
              width: number /** e.g. 320 */
              height: number /** e.g. 180 */
            }>
          }
        }
      }
      /* for the playlist metadata, with only first video */
      sidebar: {
        playlistSidebarRenderer: {
          items: Array<{
            playlistSidebarPrimaryInfoRenderer: {
              thumbnailRenderer: {
                playlistCustomThumbnailRenderer: {
                  thumbnail: {
                    thumbnails: Array<{
                      url: string /** e.g. "https://i9.ytimg.com/s_p/OLAK5uy_mBNWxa3sp5GEDZaRdrtDd5DWEJzKb2rI4/mqdefault.jpg?sqp=CMz8_sIGir7X7AMICN-A88IGEAE=&rs=AOn4CLCf4a-nkl9K1qogIbqZ104-digqfw&v=1750909023" */
                      width: number /** e.g. 180 */
                      height: number /** e.g. 180 */
                    }>
                  }
                }
              }
              title: {
                runs: Array<{
                  text: string /** e.g. "Bamboo Echoes Vol. 1: Zephyr and Ink (竹林迴響第一卷：風與墨)" */
                  navigationEndpoint: {
                    commandMetadata: {
                      webCommandMetadata: {
                        url: string /** e.g. "/watch?v=jsHol-uCDHs&list=OLAK5uy_mBNWxa3sp5GEDZaRdrtDd5DWEJzKb2rI4&pp=8AUB" */
                        webPageType: string /** e.g. "WEB_PAGE_TYPE_WATCH" */
                        rootVe: number /** e.g. 3832 */
                      }
                    }
                    watchEndpoint: {
                      videoId: string /** e.g. "jsHol-uCDHs" */
                      playlistId: string /** e.g. "OLAK5uy_mBNWxa3sp5GEDZaRdrtDd5DWEJzKb2rI4" */
                    }
                  }
                }>
              }
              stats: Array<{
                runs?: Array<{
                  text: string /** e.g. "10" */
                }>
                simpleText?: string /** e.g. "收看次數：7,816,351 次" */
              }>
            }
          }>
        }
      }
    }
    apiKey: string
    context: {
      client: {
        hl: string /** e.g. "zh-HK" */
        gl: string /** e.g. "HK" */
      }
    }
    html: string
  }

  export async function getPlaylist(
    playlistId: string,
  ): Promise<GetPlaylistResult> {
    let endpoint = `${youtubeEndpoint}/playlist?list=${playlistId}`
    let html = await getHTML(endpoint)
    let initialData = parseInitialData(html)
    let apiKey = parseApiKey(html)
    let context = parseContext(html)
    return {
      initialData,
      apiKey,
      context,
      html,
    }
  }

  function parseInitialData(html: string): any {
    let startPattern = 'var ytInitialData = '
    let endPattern = ';</script>'

    let startIndex = html.indexOf(startPattern)
    if (startIndex == -1) throw new Error('Initial data not found')

    let endIndex = html.indexOf(endPattern, startIndex)
    if (endIndex == -1) throw new Error('Initial data not found')

    let initialData = html.slice(startIndex + startPattern.length, endIndex)
    return JSON.parse(initialData)
  }

  function parseApiKey(html: string): string {
    // e.g. ',"innertubeApiKey":"...",'
    let startPattern = '"innertubeApiKey":"'
    let endPattern = '",'

    let startIndex = html.indexOf(startPattern)
    if (startIndex == -1) throw new Error('Api key not found')

    let endIndex = html.indexOf(endPattern, startIndex)
    if (endIndex == -1) throw new Error('Api key not found')

    return html.slice(startIndex + startPattern.length, endIndex)
  }

  function parseContext(html: string) {
    let key = 'INNERTUBE_CONTEXT'
    let parts = html.split(key)
    // e.g. '...,"INNERTUBE_CONTEXT":{...},"INNERTUBE_CONTEXT_CLIENT_NAME":...'
    if (parts.length < 2) throw new Error('Context not found')
    return JSON.parse(parts[1].trim().slice(2, -2))
  }
}

export namespace YoutubeSearchAPIHelper {
  export type VideoListItem = {
    id: string
    title: string
    publishedTimeText?: string
    duration?: string
    viewCountText?: string
    thumbnails: {
      url: string
      width: number
      height: number
    }[]
  }
  export async function getChannelVideos(
    channelId: string,
  ): Promise<VideoListItem[]> {
    let channel = await GetChannelById(channelId)
    let videos: VideoListItem[] = []
    channel.forEach(tab =>
      tab.content?.sectionListRenderer.contents.forEach(content => {
        content.itemSectionRenderer.contents.forEach(content => {
          content.shelfRenderer?.content.horizontalListRenderer.items.forEach(
            item => {
              let video = item.gridVideoRenderer
              if (video) {
                videos.push({
                  id: video.videoId,
                  title: video.title.simpleText,
                  publishedTimeText: video.publishedTimeText?.simpleText,
                  duration: video.thumbnailOverlays.find(
                    overlay =>
                      overlay.thumbnailOverlayTimeStatusRenderer?.text
                        ?.simpleText,
                  )?.thumbnailOverlayTimeStatusRenderer?.text?.simpleText,
                  viewCountText: video.viewCountText?.simpleText,
                  thumbnails: video.thumbnail.thumbnails,
                })
              }
            },
          )
        })
      }),
    )
    return videos
  }

  export type PlaylistData = {
    /* language of the request response, not language of the playlist settings */
    locale: string /** e.g. "zh-HK" */
    playlist: {
      playlistId: string /** e.g. "OLAK5uy_mBNWxa3sp5GEDZaRdrtDd5DWEJzKb2rI4" */
      title: string /** e.g. "Bamboo Echoes Vol. 1: Zephyr and Ink (竹林迴響第一卷：風與墨)" */
      videoCount: number /** e.g. 10 */
      viewCount: number /** e.g. 7,816,351 */
      privacy: string /** e.g. "PUBLIC" */
    }
    videos: {
      videoId: string /** e.g. "aircAruvnKk" */
      title: string /** e.g. "But what is a neural network? | Deep learning chapter 1" */
      index: number /** e.g. 1 */
      channel: {
        name: string
        channelId?: string /** e.g. "UCdIi8cjUtvHb1qLYo3AaY-Q" */
        username?: string /** e.g. "3blue1brown" */
      }
      lengthText: string /** e.g. "2:23" */
      lengthSeconds: number /** e.g. 143 */
      viewsText: string /** e.g. "19M" */
      thumbnails: {
        url: string /** e.g. "https://i.ytimg.com/vi/aircAruvnKk/hqdefault.jpg" */
        width: number /** e.g. 168 */
        height: number /** e.g. 94 */
      }[]
    }[]
  }
  export async function getPlaylist(playlistId: string): Promise<PlaylistData> {
    const playlist = await YoutubeAPI.getPlaylist(playlistId)
    let data = playlist.initialData
    let videos: PlaylistData['videos'] = []
    data.contents.twoColumnBrowseResultsRenderer.tabs.forEach(tab => {
      tab.tabRenderer.content.sectionListRenderer.contents.forEach(content => {
        content.itemSectionRenderer?.contents.forEach(content => {
          content.playlistVideoListRenderer.contents.forEach(content => {
            let video = content.playlistVideoRenderer
            /** e.g. "/channel/UCdIi8cjUtvHb1qLYo3AaY-Q" "/@3blue1brown" */
            let channelUrl =
              video.shortBylineText.runs[0].navigationEndpoint.commandMetadata
                .webCommandMetadata.url
            let channelId
            let username
            if (channelUrl.startsWith('/channel/')) {
              channelId = channelUrl.split('/').pop()!
            }
            if (channelUrl.startsWith('/@')) {
              username = channelUrl.slice(2)
            }
            videos.push({
              videoId: video.videoId,
              title: video.title.runs[0].text,
              index: +video.index.simpleText,
              channel: {
                name: video.shortBylineText.runs[0].text,
                channelId,
                username,
              },
              lengthText: video.lengthText.simpleText,
              lengthSeconds: +video.lengthSeconds,
              viewsText: parseViewCount(video.videoInfo.runs[0].text),
              thumbnails: video.thumbnail.thumbnails.map(thumbnail => ({
                url: removeSearchParams(thumbnail.url),
                width: thumbnail.width,
                height: thumbnail.height,
              })),
            })
          })
        })
      })
    })
    return {
      locale: playlist.context.client.hl,
      playlist: {
        playlistId: data.header.playlistHeaderRenderer.playlistId,
        title: data.header.playlistHeaderRenderer.title.simpleText,
        videoCount:
          +data.header.playlistHeaderRenderer.numVideosText.runs[0].text,
        viewCount: parseVideoCount(
          data.header.playlistHeaderRenderer.viewCountText.simpleText,
        ),
        privacy: data.header.playlistHeaderRenderer.privacy,
      },
      videos,
    }
  }

  function parseVideoCount(text: string): number {
    // e.g. "收看次數：7,816,351 次"
    return +text
      .split(':')
      .pop()!
      .split('：')
      .pop()!
      .split(' ')[0]
      .replaceAll(',', '')
  }

  function parseViewCount(text: string): string {
    // e.g. "收看次數：19M 次"
    return text
      .split(':')
      .pop()!
      .split('：')
      .pop()!
      .split(' ')[0]
      .replaceAll(',', '')
  }

  // e.g. "https://i.ytimg.com/vi/aircAruvnKk/hqdefault.jpg?..." -> "https://i.ytimg.com/vi/aircAruvnKk/hqdefault.jpg"
  function removeSearchParams(url: string): string {
    return url.split('?')[0]
  }
}
