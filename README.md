# Photo Validator

증명사진 검증을 위한 JavaScript 라이브러리입니다. face-api.js를 기반으로 구현되었습니다.

[데모 체험 하기 🖥️](https://photo-validator.netlify.app)


## 설치

```bash
npm install photo-validator
```

## 사용법

### 1. HTML 준비
```html
<!-- 파일 업로드 input -->
<input type="file" id="photo-upload" accept="image/*">

<!-- 결과를 표시할 div (선택사항) -->
<div id="result"></div>
```

### 2. JavaScript
```javascript
// 페이지 로드 후 모듈 초기화
window.addEventListener("DOMContentLoaded", async () => {
    // 사진 검증기 인스턴스 생성 (옵션 설정 가능)
    const validator = new PhotoValidator({
        // mo
        debug: true,
    });

    // 모델 초기화
    await validator.init('photoInput');

    // 파일 업로드 핸들러
    async function handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const img = validator.getPreviewElement();
        const errorMessages = [];
        const reader = new FileReader();
        reader.onload = function(e) {
            img.src = e.target.result;
            img.onload = async () => {
                try {
                    // 파일 형식 검사
                    if(!validator.isValidFileType(file) ) {
                        errorMessages.push("<p class='text-error'>❌ 허용되지 않는 파일 형식입니다.</p>");
                        console.error(`파일 형식 오류.. 현재 : ${file.type}`);
                    }
                    // 이미지 크기 검사
                    if(!validator.isImageSizeValid(300, 360)) {
                        errorMessages.push("<p class='text-error'>❌ 이미지 크기가 너무 작습니다.</p>");
                        console.error(`이미지 사이즈 오류.. 가로 x 세로 : ${img.width} x ${img.height}`);
                    }

                    // 이미지 비율 검사
                    if(!validator.isValidAspectRatio()) {
                        errorMessages.push("<p class='text-error'>❌ 증명 사진 비율에 맞는 이미지를 등록해주세요.</p>");
                        console.error(`이미지 사이즈 오류.. 가로 x 세로 : ${img.width} x ${img.height}`);
                    }

                    // 사진 내 여러 사람 얼굴 검출 여부 확인
                    if(!(await validator.isSingleFace())) {
                        errorMessages.push("<p class='text-error'>❌ 사진에는 반드시 한 사람이 있어야 합니다.</p>");
                        console.error("사진에는 한사람만 등장해야 합니다.");
                    }

                    // 머리가 잘리거나 사진 상단과 가까운지 여부
                    if(!(await validator.isHeadFullyVisible())) {
                        errorMessages.push("<p class='text-error'>❌ 머리가 사진 상단과 너무 가깝거나 잘려있습니다.</p>");
                        console.error("머리가 붙어있거나 잘려있는 사진입니다.")
                    }

                    // 얼굴 정면 바라봄 여부
                    if(!(await validator.isFacingForward(3.5))) {
                        errorMessages.push("<p class='text-error'>❌ 얼굴이 정면을 향하고 있지 않습니다.</p>");
                        console.error("얼굴이 정면을 향하고 있어야합니다.");
                    }
                    // 배경 색상 편차 여부
                    if(!(await validator.isUniformBackground())) {
                        errorMessages.push("<p class='text-error'>❌ 배경이 균일하지 않습니다. 단일 색상 배경을 사용하세요.</p>");
                        console.error("배경 색상이 균일하지않습니다.");
                    }
                    // 얼굴 중앙 위치 여부
                    if(!(await validator.isFaceCenteredAndComplete(false))) {
                        errorMessages.push("<p class='text-error'>❌ 얼굴이 중앙에 위치하지 않습니다.</p>");
                        console.error("얼굴이 중앙에 위치하지 않습니다.")
                    }

                } catch (error) {
                    console.error("검증 오류:", error);
                    errorMessages.push(`<p class='text-error'>❌ ${error}`);
                }

                // 에러 메시지 있는 경우 예외처리
                if(errorMessages.length > 0) {
                    document.getElementById("result").innerHTML = errorMessages.join("\n");
                } else{
                    document.getElementById("result").innerHTML = "<p class='text-success'>✅ 증명 사진으로 적합합니다.</p>";
                }
            };
        };
        reader.readAsDataURL(file);
    }

    // 이벤트 리스너 등록
    document.getElementById("photoInput").addEventListener("change", handleImageUpload);
});
```



# PhotoValidator
`PhotoValidator` 클래스는 생성자에서 다음과 같은 옵션들을 받습니다:

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `modelsPath` | `/models` | 얼굴 인식 모델이 저장된 경로를 지정합니다. face-api.js 모델 파일들이 위치한 디렉토리 경로입니다. |
| `eyeHeightDiffThreshold` | `3.5` | 눈 높이 차이의 임계값입니다. 두 눈의 높이 차이가 이 값보다 크면 얼굴이 기울어진 것으로 판단합니다. |
| `colorThreshold` | `15` | 색상 임계값으로, 배경색 판단 등 색상 관련 검증에 사용됩니다. |
| `centerOffsetXRatio` | `0.2` | 얼굴의 X축(가로) 중심 오프셋 비율입니다. 얼굴이 이미지의 중앙에서 얼마나 벗어날 수 있는지를 정의합니다. |
| `centerOffsetYRatio` | `0.28` | 얼굴의 Y축(세로) 중심 오프셋 비율입니다. 얼굴이 이미지의 중앙에서 얼마나 벗어날 수 있는지를 정의합니다. |
| `debug` | `false` | 디버그 모드 활성화 여부입니다. `true`로 설정하면 콘솔에 디버그 정보가 출력되고, 캔버스에 인식 결과를 시각적으로 표시합니다. |


## API

| 메서드 | 설명 | 실패 조건 |
|--------|------|-----------|
| `isSingleFace()` | 단일 얼굴 검사 | 여러 명이 있는 경우 |
| `isFacingForward()` | 정면 얼굴 검사 | 측면 혹은 얼굴이 비스듬한 경우 |
| `isUniformBackground()` | 배경 단일 색상 검사 | 배경 그라데이션이 있거나 길거리에서 촬영한 경우 |
| `isHeadFullyVisible()` | 머리 완전성 검사 | 머리가 사진 상단에 너무 가까이 있거나 잘린 경우 |
| `isFaceCenteredAndComplete()` | 얼굴 중앙 위치 검사 | 얼굴이 중앙에 위치하지 않는 경우 |
| `isValidAspectRatio()` | 이미지 비율 검사 | 이미지 비율이 증명사진, 여권사진 비율이 아닌 경우 |

## 라이센스

MIT

## Thanks to ❤️
> 위 모듈을 기획 및 개발을 함께 해주신 분들께 감사의 마음을 표합니다. 🫶
>
>`안태규 팀장`
>`최우리 TL`
>
>`조태응 팀장`
>`정신환 팀장`
>
>`이홍순 수석`
>`이현미 책임`
> 
>`김규진 책임`
>`김화종 선임`

## Repository
https://github.com/jinwanseo/photo-validator

## Bug & Issue
https://github.com/jinwanseo/photo-validator/issues
