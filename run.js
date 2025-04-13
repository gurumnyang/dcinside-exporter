const fs = require('fs');
const path = require('path');
const cliProgress = require('cli-progress');
const { getPostContent, scrapeBoardPages } = require('./src/scraper');
const { askQuestion, validateNumberInput } = require('./src/util');

const OUTPUT_DIR = './output';

/**
 * 게시글 번호 범위로 크롤링을 진행합니다.
 * @param {number} startNo 시작 게시글 번호
 * @param {number} endNo 종료 게시글 번호
 * @param {string} galleryId 갤러리 식별자
 * @returns {Promise<Object[]>} 크롤링된 게시글 배열
 */
async function scrapePostsWithProgress(startNo, endNo, galleryId) {
    // 시작번호와 종료번호를 정렬하여 배열 생성
    if (startNo > endNo) {
        [startNo, endNo] = [endNo, startNo];
    }
    const numbers = Array.from({ length: endNo - startNo + 1 }, (_, i) => startNo + i);
    return scrapePostsWithArray(numbers, galleryId);
}

/**
 * 주어진 게시글 번호 배열을 사용해 게시글을 크롤링합니다.
 * @param {number[]} numbers 게시글 번호 배열
 * @param {string} galleryId 갤러리 식별자
 * @returns {Promise<Object[]>} 크롤링된 게시글 배열
 */
async function scrapePostsWithArray(numbers, galleryId) {
    const totalPosts = numbers.length;
    const progressBar = new cliProgress.SingleBar({
        format: '게시글 번호 크롤링 진행 |{bar}| {percentage}% || {value}/{total} 게시글',
        hideCursor: true
    }, cliProgress.Presets.shades_classic);
    progressBar.start(totalPosts, 0);

    const posts = [];
    for (const no of numbers) {
        try {
            const post = await getPostContent(galleryId, no);
            if (!post) {
                console.error(`게시글 ${no} 크롤링 실패`);
                continue;
            }
            posts.push(post);
        } catch (error) {
            console.error(`게시글 ${no} 크롤링 중 에러 발생: ${error.message}`);
        }
        progressBar.increment();
        await delay(50);
    }
    progressBar.stop();
    return posts;
}

/**
 * 게시판 페이지 범위로 게시글을 크롤링합니다.
 * @param {number} startPage 시작 페이지 번호
 * @param {number} endPage 종료 페이지 번호
 * @param {string} galleryId 갤러리 식별자
 * @param {string} [typeParam='all'] 게시판 유형 ('all', 'recommend', 'notice')
 * @returns {Promise<Object[]>} 크롤링된 게시글 배열
 */
async function scrapeBoardPagesWithProgress(startPage, endPage, galleryId, typeParam = 'all') {
    let postNumbers = [];
    try {
        postNumbers = await scrapeBoardPages(startPage, endPage, galleryId, { exception_mode: typeParam });
    } catch (error) {
        console.error(`게시판 페이지 크롤링 중 에러 발생: ${error.message}`);
    }

    // 중복 제거
    postNumbers = Array.from(new Set(postNumbers));

    const totalPosts = postNumbers.length;
    const progressBar = new cliProgress.SingleBar({
        format: '게시글 크롤링 진행 |{bar}| {percentage}% || {value}/{total} 게시글',
        hideCursor: true
    }, cliProgress.Presets.shades_classic);
    progressBar.start(totalPosts, 0);

    const delayMs = 10; // 요청 간 딜레이(ms)
    const posts = [];
    for (const no of postNumbers) {
        const startTime = new Date();
        try {
            const post = await getPostContent(galleryId, no);
            posts.push(post);
        } catch (error) {
            console.error(`게시글 ${no} 크롤링 중 에러 발생: ${error.message}`);
        }
        progressBar.increment();

        const elapsedTime = new Date() - startTime;
        if (elapsedTime < delayMs) {
            await delay(delayMs - elapsedTime);
        }
    }
    progressBar.stop();
    return posts;
}

/**
 * 지정한 시간(ms)만큼 지연합니다.
 * @param {number} ms 지연 시간 (밀리초)
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 메인 실행 함수: 사용자 입력에 따라 적절한 크롤링 작업을 수행합니다.
 */
async function main() {
    try {
        console.log('DCInside 갤러리 크롤링 프로그램');

        // 갤러리 ID 입력 받기
        const galleryInput = await askQuestion('갤러리 ID(기본:chatgpt): ');
        const galleryId = galleryInput || 'chatgpt';

        // 옵션 선택
        console.log("==========================");
        console.log('옵션을 선택하세요(기본:1):');
        console.log('1: 게시글 번호 범위로 크롤링');
        console.log('2: 게시판 페이지 범위로 크롤링');
        console.log('3: 게시글 번호로 크롤링');

        const option = await askQuestion('옵션 선택 (1~3): ');
        if (!['1', '2', '3'].includes(option)) {
            console.log('올바르지 않은 옵션입니다.');
            return;
        }

        let typeParam = 'all';
        if (option === '2') {
            console.log("==========================");
            console.log('게시판을 선택하세요(기본:1):');
            console.log('1: 전체글');
            console.log('2: 개념글');
            console.log('3: 공지');

            const typeInput = await askQuestion('게시판 선택 (1~3): ');
            switch (typeInput) {
                case '1':
                    typeParam = 'all';
                    break;
                case '2':
                    typeParam = 'recommend';
                    break;
                case '3':
                    typeParam = 'notice';
                    break;
                default:
                    console.log('올바르지 않은 게시판입니다.');
                    return;
            }
        }

        let posts = [];
        if (option === '1') {
            const startNo = validateNumberInput(await askQuestion('시작 게시글 번호: '), 1);
            const endNo = validateNumberInput(await askQuestion('끝 게시글 번호: '), startNo);
            posts = await scrapePostsWithProgress(startNo, endNo, galleryId);
        } else if (option === '2') {
            const startPage = validateNumberInput(await askQuestion('시작 페이지 번호: '), 1);
            const endPage = validateNumberInput(await askQuestion('끝 페이지 번호: '), startPage);
            posts = await scrapeBoardPagesWithProgress(startPage, endPage, galleryId, typeParam);
        } else if (option === '3') {
            const input = await askQuestion('게시글 번호를 쉼표로 구분하여 입력하세요: ');
            const numberStrings = input.split(',').map(s => s.trim()).filter(Boolean);
            if (numberStrings.length === 0) {
                console.log('게시글 번호가 입력되지 않았습니다.');
                return;
            }
            const numbers = numberStrings.map(num => parseInt(num, 10));
            if (numbers.some(isNaN)) {
                console.log('올바르지 않은 게시글 번호가 포함되어 있습니다.');
                return;
            }
            posts = await scrapePostsWithArray(numbers, galleryId);
        }

        console.log('크롤링 완료!');
        if (posts.length > 3) {
            console.log(`게시글 개수: ${posts.length}`);
            console.log('게시글 일부 미리보기:');
            console.log(JSON.stringify(posts.slice(0, 3), null, 2));
        } else {
            console.log(JSON.stringify(posts, null, 2));
        }

        // output 디렉토리가 없으면 생성
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR);
        }

        // 파일명: 타임스탬프 기반
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
        const filename = `${timestamp}.json`;
        const filePath = path.join(OUTPUT_DIR, filename);

        fs.writeFile(filePath, JSON.stringify(posts, null, 2), err => {
            if (err) {
                console.error('JSON 파일 저장 실패:', err);
            } else {
                console.log(`크롤링 결과가 ${filePath} 파일에 저장되었습니다.`);
            }
        });
    } catch (error) {
        console.error('프로그램 실행 중 에러 발생:', error.message);
    }
}

main();
