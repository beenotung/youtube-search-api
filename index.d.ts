export type GetDataOption = {
    type: 'video' | 'channel' | 'playlist' | 'movie';
};
type Thumbnail = {
    thumbnails: Array<{
        url: string;
        width: number;
        height: number;
    }>;
};
export type GetDataResult = {
    items: Array<ChannelItem | VideoItem | {}>;
    nextPage: NextPageData;
};
export type NextPageData = {
    nextPageToken: string;
    nextPageContext: {
        context: {
            client: {
                hl: string;
                gl: string;
                remoteHost: string;
                deviceMake: string;
                deviceModel: string;
                visitorData: string;
                userAgent: string;
                clientName: string;
                clientVersion: string;
                osVersion: string;
                originalUrl: string;
                platform: string;
                clientFormFactor: string;
                configInfo: {
                    appInstallData: string;
                };
                acceptHeader: string;
                deviceExperimentId: string;
            };
            user: {
                lockedSafetyMode: boolean;
            };
            request: {
                useSsl: boolean;
            };
            clickTracking: {
                clickTrackingParams: string;
            };
        };
        continuation: string | {};
    };
};
export type ChannelItem = {
    id: string;
    type: 'channel';
    thumbnail: Thumbnail;
    title: string;
};
export type VideoItem = {
    id: string;
    type: 'video';
    thumbnail: Thumbnail;
    title: string;
    channelTitle: string;
    shortBylineText: {
        runs: Array<{
            text: string;
            navigationEndpoint: {
                clickTrackingParams: string;
                commandMetadata: {
                    webCommandMetadata: {
                        url: string;
                        webPageType: string;
                        rootVe: number;
                        apiUrl: string;
                    };
                };
                browseEndpoint: {
                    browseId: string;
                    canonicalBaseUrl: string;
                };
            };
        }>;
    };
    length: {
        accessibility: {
            accessibilityData: {
                label: string;
            };
        };
        simpleText: string;
    };
    isLive: boolean;
};
export type GetPlaylistDataResult = {
    items: Array<VideoItem | {}>;
    metadata: object;
};
export type GetSuggestDataResult = {
    items: Array<VideoItem | {}>;
};
export declare const GetListByKeyword: (keyword: string, withPlaylist?: boolean, limit?: number, options?: GetDataOption[]) => Promise<GetDataResult>;
export declare const NextPage: (nextPage: NextPageData, withPlaylist?: boolean, limit?: number) => Promise<GetDataResult>;
export declare const GetPlaylistData: (playlistId: string, limit?: number) => Promise<GetPlaylistDataResult>;
export declare const GetSuggestData: (limit?: number) => Promise<GetSuggestDataResult>;
export type GetChannelByIdResult = {
    title: string;
    content: string;
}[];
export declare const GetChannelById: (channelId: string) => Promise<GetChannelByIdResult>;
export type GetVideoDetailsResult = {
    title: string;
    isLive: boolean;
    channel: string;
    description: string | undefined;
    suggestion: VideoItem[];
};
export declare const GetVideoDetails: (videoId: string) => Promise<GetVideoDetailsResult>;
export {};
