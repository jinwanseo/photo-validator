const faceapi = require('face-api.js');

class PhotoValidator {
    constructor(options = {}) {
        // 기본 설정값
        this.config = {
            modelsPath: options.modelsPath || './node_modules/photo-validator/dist/models',
            eyeHeightDiffThreshold: options.eyeHeightDiffThreshold || 3.5,
            colorThreshold: options.colorThreshold || 15,
            centerOffsetXRatio: options.centerOffsetXRatio || 0.2,
            centerOffsetYRatio: options.centerOffsetYRatio || 0.28,
            debug: options.debug || false,
        };

        // 모델 로드 여부 (init 호출 여부)
        this.isModelLoaded = false;
        // 파일 업로드 태그
        this.fileUploadElement = null;
        // 캔버스 태그
        this.canvasContainerElement = null;
        // 이미지 태그 (안보이게 처리)
        this.previewElement = null;
    }

    /**
     * title : 모델 초기화
     * author : jinwanseo
     * @param fileTagId 업로드이미지 Input file TAG ID
     * @param createCanvasId 자동으로 생성될 디버그 캔버스 TAG ID
     * @param createPreviewId 자동으로 생성될 미리보기 TAG ID
     * @param createResultId 자동으로 생성될 결과 로그 TAG ID
     * @returns {Promise<boolean>} 모델 초기화 성공 여부
     */
    async init(fileTagId, createCanvasId = null, createPreviewId = null) {
        try {
            let isCreatedPreview = !!createPreviewId;
            // 모델 로드 안되어있을시 모델 로드
            if (!this.isModelLoaded) {
                // 모델 파일 경로 설정
                const modelsPath = this.config.modelsPath;
                await faceapi.nets.ssdMobilenetv1.loadFromUri(modelsPath);
                await faceapi.nets.faceLandmark68Net.loadFromUri(modelsPath);
                this.isModelLoaded = true;
                if(this.config.debug) console.warn("모델 로드 완료");
            }

            // 검증 관련 UI Element 추가
            const canvasContainerId = createCanvasId ?? `${fileTagId}-canvas-container`;
            const previewElementId= createPreviewId ?? `${fileTagId}-preview`;

            // 기본 스타일 추가
            document.querySelector("head").innerHTML += `
                <style>
                    #${canvasContainerId} canvas {
                        display: inline-block;
                        margin: 20px 0;
                        border: 1px solid #ddd;
                        background-color: rgba(255, 255, 255, 0.8);
                    }
                    
                    ${
                        isCreatedPreview ? "" : `
                        #${previewElementId} {
                            display: none;
                        }`
                    }
                </style>
            `;

            // 태그 생성
            this.fileUploadElement = document.getElementById(fileTagId);
            this.canvasContainerElement  = document.createElement("div");
            this.canvasContainerElement.id = canvasContainerId;

            // Preview 를 외부에서 생성했다면 생성 X
            if(!isCreatedPreview) {
                this.previewElement = document.createElement("img");
                this.previewElement.id = previewElementId;
                this.fileUploadElement.parentElement.insertBefore(this.previewElement, this.fileUploadElement.nextSibling);
            }

            // 태그 배치
            this.fileUploadElement.parentElement.insertBefore(this.canvasContainerElement, this.fileUploadElement.nextSibling);



            return true;
        } catch (error) {
            console.error("모델 초기화 실패:", error);
            return false;
        }
    }

    // 미리보기 Element GET
    getPreviewElement() {
        return this.previewElement;
    }

    // 파일 형식 검사
    isValidFileType(file) {
        if (!this.isModelLoaded) {
            throw new Error("모델이 초기화되지 않았습니다. init() 메서드를 먼저 호출하세요.");
        }
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
        return allowedTypes.includes(file.type);
    }

    // 이미지 크기 검사
    isImageSizeValid(minImgWidthPx, minImgHeightPx) {
        return (this.previewElement.naturalWidth >= minImgWidthPx) &&
            (this.previewElement.naturalHeight >= minImgHeightPx);
    }

    // 얼굴 하나만 있는지 검사
    async isSingleFace() {
        const detections = await faceapi.detectAllFaces(this.previewElement);
        if(detections.length > 1) {
            // 얼굴이 없거나 여러 개인 경우
            await this._createDebugCanvasAll(detections, false);
            throw new Error("증명사진에는 여러사람이 있을수 없습니다.");
            return false;
        }
        return detections.length === 1;
    }

    // 정면 얼굴 검사
    async isFacingForward() {
        // 얼굴 객체 인식 표 검출
        const detection = await this._getFaceDetection();
        const landmarks = detection.landmarks;
        const leftEye = landmarks.getLeftEye();
        const rightEye = landmarks.getRightEye();
        // 왼쪽 오른쪽 눈에서 가장 높은 위치 확인
        const maxLeftEye = Math.max(...leftEye.map(p => p.y));
        const maxRightEye = Math.max(...rightEye.map(p => p.y));
        const eyeHeightDiff = Math.abs(maxLeftEye - maxRightEye);

        return eyeHeightDiff < this.config.eyeHeightDiffThreshold;
    }

    // 배경 단일 색상 검사
    async isUniformBackground() {
        // 얼굴 영역 검출
        const detection = await this._getFaceDetection();
        const canvas = document.createElement("canvas");
        canvas.width = this.previewElement.naturalWidth;
        canvas.height = this.previewElement.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.previewElement, 0, 0, canvas.width, canvas.height);

        // 얼굴 영역 정보
        const box = detection.detection.box;

        // 사람의 상체 영역 추정 (머리 부분 포함)
        const personRegion = {
            x: Math.max(0, box.x - box.width * 0.3),
            y: Math.max(0, box.y - box.height * 0.7),
            width: box.width * 1.6,
            height: box.height * 2.0
        };

        // 캔버스 경계를 넘지 않도록 조정
        personRegion.width = Math.min(personRegion.width, canvas.width - personRegion.x);
        personRegion.height = Math.min(personRegion.height, canvas.height - personRegion.y);

        // 하단 50% 영역을 제외 영역으로 설정
        const bottomExclusionY = canvas.height * 0.5;

        // 배경 샘플링 영역 - 이미지 가장자리에서 추출
        const margin = 10;
        const sampleSize = 10;

        // 이미지 테두리 주변으로 여러 샘플 포인트 생성
        let samplePoints = [];

        // 왼쪽 테두리 (상단 50%만)
        for (let y = margin; y < bottomExclusionY - margin; y += bottomExclusionY / 5) {
            samplePoints.push({ x: margin, y: y, width: sampleSize, height: sampleSize });
        }

        // 오른쪽 테두리 (상단 50%만)
        for (let y = margin; y < bottomExclusionY - margin; y += bottomExclusionY / 5) {
            samplePoints.push({ x: canvas.width - margin - sampleSize, y: y, width: sampleSize, height: sampleSize });
        }

        // 상단 테두리
        for (let x = margin + sampleSize * 2; x < canvas.width - margin - sampleSize * 2; x += canvas.width / 8) {
            samplePoints.push({ x: x, y: margin, width: sampleSize, height: sampleSize });
        }

        // 중간 가로선 (상단 50% 내에서)
        const midY = bottomExclusionY * 0.5;
        for (let x = margin + sampleSize * 2; x < canvas.width - margin - sampleSize * 2; x += canvas.width / 8) {
            samplePoints.push({ x: x, y: midY, width: sampleSize, height: sampleSize });
        }

        const colorVariations = [];

        // 각 샘플 포인트의 색상 분석
        for (const point of samplePoints) {
            // 하단 60% 영역인지 확인
            const isInBottomArea = point.y > bottomExclusionY;

            // 샘플 영역이 사람 영역과 겹치는지 확인
            const isOverlapping =
                (point.x < personRegion.x + personRegion.width) &&
                (point.x + point.width > personRegion.x) &&
                (point.y < personRegion.y + personRegion.height) &&
                (point.y + point.height > personRegion.y);

            // 겹치지 않고, 하단 영역도 아닌 경우만 분석
            if (!isOverlapping && !isInBottomArea) {
                const imageData = ctx.getImageData(point.x, point.y, point.width, point.height);
                const colors = this._analyzeColors(imageData.data);
                colorVariations.push(colors);
            }
        }

        // 배경 색상의 일관성 분석
        if (colorVariations.length < 3) {
            if(this.config.debug) console.error("배경 샘플이 부족합니다: " + colorVariations.length);
            return true; // 샘플이 너무 적으면 판단 보류 (통과 처리)
        }

        // 색상 표준편차 계산
        const redValues = colorVariations.map(c => c.avgRed);
        const greenValues = colorVariations.map(c => c.avgGreen);
        const blueValues = colorVariations.map(c => c.avgBlue);

        const redStdDev = this._calculateStdDev(redValues);
        const greenStdDev = this._calculateStdDev(greenValues);
        const blueStdDev = this._calculateStdDev(blueValues);

        if (this.config.debug) {
            console.debug("색상 표준편차:", { red: redStdDev, green: greenStdDev, blue: blueStdDev });
            console.debug("분석된 배경 샘플 수:", colorVariations.length);
        }

        return (
            redStdDev < this.config.colorThreshold &&
            greenStdDev < this.config.colorThreshold &&
            blueStdDev < this.config.colorThreshold
        );
    }
    
    // 머리가 잘렸는지 여부
    async isHeadFullyVisible() {
        const detection = await this._getFaceDetection();
        const box = detection.detection.box;

        // 머리가 사진 윗부분에 잘려있는지 여부
        const topDistanceRatio = box.y / this.previewElement.naturalHeight;
        // 디버깅 용도: 비율 출력
        if (this.config.debug) {
            console.warn("Top Distance Ratio:", topDistanceRatio);
        }

        return topDistanceRatio > 0.13;
    }

    // 얼굴 중앙 위치 및 완전성 검사
    async isFaceCenteredAndComplete() {
        const detection = await this._getFaceDetection();

        // 얼굴 Bounding Box와 중심 계산
        const box = detection.detection.box;
        const centerX = this.previewElement.naturalWidth / 2;
        const centerY = this.previewElement.naturalHeight / 2;
        const faceCenterX = box.x + box.width / 2;
        const faceCenterY = box.y + box.height / 2;

        // 허용된 편차 계산
        const offsetX = Math.abs(centerX - faceCenterX);
        const offsetY = Math.abs(centerY - faceCenterY);
        const maxOffsetX = this.previewElement.naturalWidth * this.config.centerOffsetXRatio;
        const maxOffsetY = this.previewElement.naturalHeight * this.config.centerOffsetYRatio;

        if (this.config.debug) {
            console.warn("Offset:", { offsetX, offsetY, maxOffsetX, maxOffsetY });
        }

        // 얼굴이 중앙에 있는지 여부
        const isCentered = offsetX < maxOffsetX && offsetY < maxOffsetY;
        const isFaceFullyVisible = box.y > 0 && box.height < this.previewElement.naturalHeight;

        const isValid = isCentered && isFaceFullyVisible;

        // 가이드라인을 검증 결과에 따라 색상 지정하여 그리기
        this._createDebugCanvas(detection, isValid);

        return isValid;
    }


    /**
     * 사진 비율이 허용된 비율 중 하나인지 검사
     * 허용된 비율: 3x5, 4x6, 5x7.5, 6x9, 8x10, 12x17
     * @returns {boolean} 허용된 비율이면 true, 아니면 false
     */
    isValidAspectRatio() {
        if (!this.isModelLoaded) {
            throw new Error("모델이 초기화되지 않았습니다. init() 메서드를 먼저 호출하세요.");
        }

        // 이미지 크기 가져오기
        const width = this.previewElement.naturalWidth;
        const height = this.previewElement.naturalHeight;

        // 현재 비율 계산 (소수점 3자리까지)
        const currentRatio = Number((width / height).toFixed(3));


        if (this.config.debug) {
            console.warn("현재 이미지 비율:", currentRatio);
        }

        return 0.6 <= currentRatio && currentRatio <= 0.8;
    }

    // 얼굴이 있는지 검사
    async _getFaceDetection() {
        const detection = await faceapi.detectSingleFace(this.previewElement).withFaceLandmarks();
        if (!detection) {
            throw new Error("사진내 얼굴이 없습니다.");
        }
        return detection;
    }

    // 색상 분석 헬퍼 함수
    _analyzeColors(data) {
        let totalRed = 0;
        let totalGreen = 0;
        let totalBlue = 0;
        const pixelCount = data.length / 4; // RGBA 데이터

        for (let i = 0; i < data.length; i += 4) {
            totalRed += data[i];
            totalGreen += data[i + 1];
            totalBlue += data[i + 2];
        }

        return {
            avgRed: totalRed / pixelCount,
            avgGreen: totalGreen / pixelCount,
            avgBlue: totalBlue / pixelCount
        };
    }

    // 표준편차 계산 헬퍼 함수
    _calculateStdDev(values) {
        const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
        const squareDiffs = values.map(value => {
            const diff = value - avg;
            return diff * diff;
        });
        const avgSquareDiff = squareDiffs.reduce((sum, val) => sum + val, 0) / squareDiffs.length;
        return Math.sqrt(avgSquareDiff);
    }

    // 디버깅 캔버스 생성
    _createDebugCanvas(detection, isValidated = false) {
        if (!this.canvasContainerElement) {
            if(this.config.debug) console.warn("캔버스 컨테이너가 설정되지 않았습니다.");
            return;
        }
        this.canvasContainerElement.innerHTML = ""; // 기존 캔버스 제거

        // 고정된 캔버스 크기 설정
        const fixedWidth = 400;
        const fixedHeight = 500;

        const canvas = document.createElement("canvas");
        canvas.width = fixedWidth;
        canvas.height = fixedHeight;
        const ctx = canvas.getContext("2d");

        // 이미지 비율 유지하면서 캔버스에 맞추기
        const scale = Math.min(
            fixedWidth / this.previewElement.naturalWidth,
            fixedHeight / this.previewElement.naturalHeight
        );

        // 이미지를 중앙에 위치시키기 위한 좌표 계산
        const x = (fixedWidth - this.previewElement.naturalWidth * scale) / 2;
        const y = (fixedHeight - this.previewElement.naturalHeight * scale) / 2;

        // 캔버스 배경을 흰색으로 설정
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, fixedWidth, fixedHeight);

        // 원본 이미지 렌더링 (비율 유지하며 크기 조정)
        ctx.drawImage(
            this.previewElement,
            0, 0, this.previewElement.naturalWidth, this.previewElement.naturalHeight,
            x, y, this.previewElement.naturalWidth * scale, this.previewElement.naturalHeight * scale
        );

        // 얼굴 Bounding Box와 랜드마크 표시 (스케일 적용)
        if (detection) {
            const box = detection.detection.box;
            // 검증 성공 시 녹색, 실패 시 빨간색
            ctx.strokeStyle = isValidated ? "green" : "red";
            ctx.lineWidth = 2;
            ctx.strokeRect(
                x + box.x * scale,
                y + box.y * scale,
                box.width * scale,
                box.height * scale
            );

            // 랜드마크 표시
            ctx.fillStyle = "blue";
            detection.landmarks.positions.forEach((pos) => {
                ctx.beginPath();
                ctx.arc(
                    x + pos.x * scale,
                    y + pos.y * scale,
                    2, 0, 2 * Math.PI
                );
                ctx.fill();
            });
        } else {
            ctx.font = "16px Arial";
            ctx.fillStyle = "red";
            ctx.fillText("얼굴을 검출할 수 없습니다.", fixedWidth / 4, fixedHeight / 2);
        }

        // 캔버스 추가
        this.canvasContainerElement.appendChild(canvas);
    }

    /**
     * 여러 얼굴 검출 결과를 하나의 캔버스에 모두 표시
     * @param {Array} detections 검출된 얼굴 객체 배열
     * @param {boolean} isValidated 검증 결과
     */
    async _createDebugCanvasAll(detections, isValidated = false) {
        if (!this.canvasContainerElement) {
            if(this.config.debug) console.warn("캔버스 컨테이너가 설정되지 않았습니다.");
            return;
        }

        this.canvasContainerElement.innerHTML = ""; // 기존 캔버스 제거

        // 고정된 캔버스 크기 설정
        const fixedWidth = 400;
        const fixedHeight = 500;

        const canvas = document.createElement("canvas");
        canvas.width = fixedWidth;
        canvas.height = fixedHeight;
        const ctx = canvas.getContext("2d");

        // 이미지 비율 유지하면서 캔버스에 맞추기
        const scale = Math.min(
            fixedWidth / this.previewElement.naturalWidth,
            fixedHeight / this.previewElement.naturalHeight
        );

        // 이미지를 중앙에 위치시키기 위한 좌표 계산
        const x = (fixedWidth - this.previewElement.naturalWidth * scale) / 2;
        const y = (fixedHeight - this.previewElement.naturalHeight * scale) / 2;

        // 캔버스 배경을 흰색으로 설정
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, fixedWidth, fixedHeight);

        // 원본 이미지 렌더링 (비율 유지하며 크기 조정)
        ctx.drawImage(
            this.previewElement,
            0, 0, this.previewElement.naturalWidth, this.previewElement.naturalHeight,
            x, y, this.previewElement.naturalWidth * scale, this.previewElement.naturalHeight * scale
        );

        // 검출된 얼굴이 있는 경우
        if (detections && detections.length > 0) {
            // 각 검출된 얼굴마다 처리
            for (let i = 0; i < detections.length; i++) {
                const detection = detections[i];
                const box = detection.box || detection.detection?.box;

                if (!box) continue;

                // Bounding Box 그리기
                ctx.strokeStyle = "red";
                ctx.lineWidth = 2;
                ctx.strokeRect(
                    x + box.x * scale,
                    y + box.y * scale,
                    box.width * scale,
                    box.height * scale
                );

                // 랜드마크가 있는 경우 표시
                if (detection.landmarks || detection.landmarks?.positions) {
                    const positions = detection.landmarks?.positions || detection.landmarks;

                    if (positions && Array.isArray(positions)) {
                        ctx.fillStyle = ctx.strokeStyle;
                        positions.forEach((pos) => {
                            ctx.beginPath();
                            ctx.arc(
                                x + pos.x * scale,
                                y + pos.y * scale,
                                2, 0, 2 * Math.PI
                            );
                            ctx.fill();
                        });
                    }
                }
            }

        }

        // 캔버스 추가
        this.canvasContainerElement.appendChild(canvas);
    }
}

if (typeof window !== 'undefined') {
    window.PhotoValidator = PhotoValidator;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PhotoValidator;
}