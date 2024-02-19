import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LolService {
  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  private RiotBaseUrlAsia = this.config.get('RIOT_BASE_URL_ASIA');
  private RiotBaseUrlKr = this.config.get('RIOT_BASE_URL_KR');
  private RiotAppKey = this.config.get('RIOT_API_APP_KEY');
  private DiscordWebHookUrl = this.config.get('DISCORD_WEBHOOK_URL');

  private getCurrentDate() {
    const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

    const YEAR = new Date().getFullYear();
    const MONTH = new Date().getMonth();
    const DATE = new Date().getDate();
    const DAY = DAYS[new Date().getDay()];
    const HOUR = new Date().getHours();
    const MINUTE = new Date().getMinutes();
    const SECOND = new Date().getSeconds();

    const currentTime = `${YEAR}/${MONTH}/${DATE}/${DAY} ${HOUR}시${MINUTE}분${SECOND}초`;

    return currentTime;
  }

  async getSummonersEncryptedId(body): Promise<any> {
    const { summonersName, summonersTag } = body;

    console.log(`----------------------------------------------`);
    console.log(`조회 계정: ${summonersName} #${summonersTag}`);

    const encodedSummonersName = encodeURIComponent(summonersName);
    const encodedSummonersTag = encodeURIComponent(summonersTag);

    const GetSummonersEncryptedPuuidUrl = `${this.RiotBaseUrlAsia}/riot/account/v1/accounts/by-riot-id/${encodedSummonersName}/${encodedSummonersTag}?api_key=${this.RiotAppKey}`;

    try {
      var responseBySummonersNameTag = await this.httpService
        .get(GetSummonersEncryptedPuuidUrl)
        .toPromise();
    } catch (error) {
      console.log('소환사 계정 검색 에러: ', error.response.status);
      if (error.response.status === 403)
        return {
          message: `이름 또는 태그를 입력해 주세요.<br>(code: ${error.response.status})`,
          errorCode: error.response.status,
        };
      else if (error.response.status === 400)
        return {
          message: `잘못된 입력입니다.<br>(code: ${error.response.status})`,
          errorCode: error.response.status,
        };
      else if (error.response.status === 404)
        return {
          message: `존재하지 않는 아이디입니다.<br>(code: ${error.response.status})`,
          errorCode: error.response.status,
        };
      else
        return {
          message: `서버 오류.<br>(code: ${error.response.status})`,
          errorCode: error.response.status,
        };
    }

    const summonersEncryptedPuuid = responseBySummonersNameTag.data.puuid;

    const GetEncryptedSummonersIdUrl = `${this.RiotBaseUrlKr}/lol/summoner/v4/summoners/by-puuid/${summonersEncryptedPuuid}?api_key=${this.RiotAppKey}`;

    try {
      var responseBySummonersPuuid = await this.httpService
        .get(GetEncryptedSummonersIdUrl)
        .toPromise();
    } catch (error) {
      console.log('소환사 암호화ID 검색 에러: ', error.response.status);
      if (error.response.status === 404)
        return {
          message: `리그오브레전드 아이디가 아닙니다.<br>(code: ${error.response.status})`,
          errorCode: error.response.status,
        };
      else
        return {
          message: `서버 오류.<br>(code: ${error.response.status})`,
          errorCode: error.response.status,
        };
    }

    const summonersEncryptedId = responseBySummonersPuuid.data.id;

    const GetSummonersInfoUrl = `${this.RiotBaseUrlKr}/lol/league/v4/entries/by-summoner/${summonersEncryptedId}?api_key=${this.RiotAppKey}`;

    try {
      var responseBySummonersEncryptedId = await this.httpService
        .get(GetSummonersInfoUrl)
        .toPromise();
    } catch (error) {
      console.log('소환사 정보 검색 에러: ', error.response.status);
      if (error.response.status === 404)
        return {
          message: `소환사 정보가 존재하지 않습니다.<br>(code: ${error.response.status})`,
          errorCode: error.response.status,
        };
      else
        return {
          message: `서버 오류.<br>(code: ${error.response.status})`,
          errorCode: error.response.status,
        };
    }

    const summonersInfo = responseBySummonersEncryptedId.data;

    return { summonersEncryptedId, summonersInfo };
  }

  async getSummonersStatus(body): Promise<any> {
    const { summonersName, summonersEncryptedId } = body;

    const GetStartGameTimeUrl = `${this.RiotBaseUrlKr}/lol/spectator/v4/active-games/by-summoner/${summonersEncryptedId}?api_key=${this.RiotAppKey}`;

    try {
      const responseBySummonersId = await this.httpService
        .get(GetStartGameTimeUrl)
        .toPromise();

      const gameStartTime = responseBySummonersId.data.gameStartTime; // epochTime

      const currentEpochTime = new Date().getTime();

      if (currentEpochTime > gameStartTime + 30000 + 180000)
        return {
          message: `'${summonersName}'<br>님의 게임이 시작 후 3분이 경과되어<br>조회가 불가능합니다.<br>(code: 403.1)`,
          errorCode: 403.1,
        };
    } catch (error) {
      console.log('인게임 검색 에러: ', error.response.status);
      if (error.response.status === 404)
        return {
          message: `'${summonersName}'<br>님은 현재 게임중이 아닙니다.<br>(code: ${error.response.status})`,
          errorCode: error.response.status,
        };
      else
        return {
          message: `서버 오류.<br>(code: ${error.response.status})`,
          errorCode: error.response.status,
        };
    }

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)); // API fetch 딜레이

    let startTimeList = []; // 게임 시작 시간을 담는 배열
    let currentStartTimeIndex; // 실제 게임 시작 시간 배열 인덱스
    let fetchCount = 0; // 라이엇 인게임 조회 횟수

    do {
      if (fetchCount >= 1) await delay(10000);
      else await delay(1000);

      try {
        var responseBySummonersId = await this.httpService
          .get(GetStartGameTimeUrl)
          .toPromise();
      } catch (error) {
        console.log('인게임 검색 에러: ', error.response.status);
        if (error.response.status === 429)
          return {
            message: `현재 요청자가 많아 이용이 어렵습니다.<br>다시 시도해 주세요<br>(code: ${error.response.status})`,
            errorCode: error.response.status,
          };
        else
          return {
            message: `서버 오류.<br>(code: ${error.response.status})`,
            errorCode: error.response.status,
          };
      }

      const gameStartTime = responseBySummonersId.data.gameStartTime;

      startTimeList.push(gameStartTime);

      console.log('로딩중... ');
      console.log('현재 배열: ', startTimeList);

      fetchCount++;

      if (fetchCount === 30)
        // 로딩 시간 5분이면 종료
        return {
          message: `로딩 시간이 5분 경과되어 이용이 어렵습니다.<br>다시 시도해 주세요.<br>(code: 403.2)`,
          errorCode: 403.2,
        };
    } while (
      startTimeList.length === 1 ||
      startTimeList[fetchCount - 2] === startTimeList[fetchCount - 1]
    );

    currentStartTimeIndex = startTimeList.length - 1;

    const currentStartTime = startTimeList[currentStartTimeIndex];

    const time = new Date(currentStartTime + 30 * 1000); // 인게임 딜레이 30초 추가

    const hours = time.getHours();
    const minutes = time.getMinutes();
    const seconds = time.getSeconds();

    const currentEpochTime = new Date().getTime();

    const realTimeSeconds = Math.floor(
      (currentEpochTime - (currentStartTime + 30 * 1000)) / 1000,
    );

    return {
      gameStartTime: { hours, minutes, seconds },
      realTimeSeconds,
    };
  }
}
