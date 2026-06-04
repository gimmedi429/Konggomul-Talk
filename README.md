# 제목 미정 Assistant

SillyTavern에서 현재 캐릭터와 별도 메신저처럼 대화하는 UI 확장입니다.
본 RP 채팅에는 자동으로 삽입하지 않고, 캐릭터 카드/페르소나/최근 본채팅 메시지를 참고해 별도 Assistant 대화를 생성합니다.

## 핵심 기능

- 별도 플로팅 메신저 패널
- 캐릭터별 Assistant 대화방 저장
- 새 대화방 / 대화방 삭제 / 현재 방 전체 삭제 / 개별 메시지 삭제
- 복사 / 수동으로 본채팅 입력창에 보내기
- 모드 4개
  - Lover / Care: 제4의 벽을 부수지 않고 현실 고민, 일상 궁금증, 멘탈 대화
  - Secretary: 캐릭터가 비서 역할로 정리, 일정, 할 일, 판단 보조
  - 업무 동료: 같은 회사 동료처럼 업무 질문, 문구, 판단 보조
  - OOC 대화: RP 상황, 감정선, 전개, 캐릭터 해석을 돕는 모드
- 한국어 답변 강제
- 최대 응답 토큰 수 설정
- 최근 본채팅 읽을 메시지 수 설정
- 채팅창 폰트 크기 설정
- SillyTavern 현재 AI 연결 사용
- Connection Profile 이름 입력 옵션(실험)

## 설치

1. 이 저장소를 GitHub에 업로드합니다.
2. SillyTavern에서 `Extensions → Install Extension`을 엽니다.
3. 저장소 URL을 붙여넣고 설치합니다.
4. SillyTavern을 새로고침합니다.
5. Extensions 설정에서 `제목 미정 Assistant`를 열고 활성화합니다.

## 주의

SillyTavern Connection Profiles는 버전별 내부 접근 방식이 달라질 수 있습니다.
현재 버전은 가장 안정적인 `현재 SillyTavern 연결 사용`을 기본으로 하며, Connection Profile 이름 입력은 실험 옵션입니다.

## 저장 방식

Assistant 대화방은 캐릭터별로 브라우저/확장 저장소에 저장됩니다.
현재 캐릭터가 바뀌면 해당 캐릭터의 Assistant 대화방 목록을 따로 불러옵니다.
