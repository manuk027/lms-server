import assert from 'node:assert/strict'
import test from 'node:test'
import { MetadataNormalizer } from '../services/metadata.normalizer'
import { SimilarityEngine, similarityEngine } from '../services/similarity.engine'
import { ShelfService } from '../services/shelf.service'
import { IShelf } from '../models/Shelf'

test('MetadataNormalizer - Normalizes genres to canonical taxonomy', () => {
  assert.equal(MetadataNormalizer.normalizeGenre('computer science'), 'Computer Science')
  assert.equal(MetadataNormalizer.normalizeGenre('COMPUTERS'), 'Computer Science')
  assert.equal(MetadataNormalizer.normalizeGenre('programming'), 'Computer Science')
  assert.equal(MetadataNormalizer.normalizeGenre('entrepreneurship'), 'Entrepreneurship')
  assert.equal(MetadataNormalizer.normalizeGenre('mental work'), 'Philosophy & Psychology')
  assert.equal(MetadataNormalizer.normalizeGenre('self-help'), 'Self-Help')
  assert.equal(MetadataNormalizer.normalizeGenre(''), 'General Literature')
})

test('MetadataNormalizer - Normalizes languages to standard names', () => {
  assert.equal(MetadataNormalizer.normalizeLanguage('en'), 'English')
  assert.equal(MetadataNormalizer.normalizeLanguage('ENG'), 'English')
  assert.equal(MetadataNormalizer.normalizeLanguage('ml'), 'Malayalam')
  assert.equal(MetadataNormalizer.normalizeLanguage('hi'), 'Hindi')
  assert.equal(MetadataNormalizer.normalizeLanguage('es'), 'Spanish')
  assert.equal(MetadataNormalizer.normalizeLanguage(undefined), 'English')
})

test('MetadataNormalizer - Normalizes subject tags and removes duplicates', () => {
  const subjects = MetadataNormalizer.normalizeSubjects([
    'artificial-intelligence',
    'ARTIFICIAL INTELLIGENCE',
    'machine_learning',
    'web development',
  ])
  assert.ok(subjects.includes('Artificial Intelligence'))
  assert.ok(subjects.includes('Machine Learning'))
  assert.ok(subjects.includes('Web Development'))
  // Check deduplication
  const aiCount = subjects.filter((s) => s.toLowerCase() === 'artificial intelligence').length
  assert.equal(aiCount, 1)
})

test('SimilarityEngine - Jaccard index computation', () => {
  const setA = new Set(['algorithms', 'data-structures', 'math'])
  const setB = new Set(['algorithms', 'data-structures', 'python'])
  // Intersection: 2, Union: 4 -> J = 0.5
  const jaccard = SimilarityEngine.calculateJaccard(setA, setB)
  assert.equal(jaccard, 0.5)

  // Disjoint sets -> 0
  const setC = new Set(['history', 'war'])
  assert.equal(SimilarityEngine.calculateJaccard(setA, setC), 0)

  // Identical sets -> 1
  assert.equal(SimilarityEngine.calculateJaccard(setA, setA), 1)
})

test('SimilarityEngine - Weight normalization when metadata is missing', () => {
  const targetWithSubjects = {
    title: 'Clean Code',
    category: 'Computer Science',
    language: 'English',
    subjects: ['software', 'architecture', 'clean-code'],
    format: 'Paperback',
  }

  const refBook = {
    title: 'Code Complete',
    category: 'Computer Science',
    language: 'English',
    subjects: ['software', 'design'],
    format: 'Paperback',
  }

  const fullScore = similarityEngine.compare(targetWithSubjects, refBook)
  assert.ok(fullScore.score > 70)
  assert.ok(fullScore.matchedFields.includes('genre'))
  assert.ok(fullScore.matchedFields.includes('language'))
  assert.ok(fullScore.matchedFields.includes('format'))

  // If candidate has no subjects, subjects weight is omitted from denominator
  const targetNoSubjects = {
    title: 'Clean Code',
    category: 'Computer Science',
    language: 'English',
    format: 'Paperback',
  }

  const scoreWithoutSubjects = similarityEngine.compare(targetNoSubjects, refBook)
  // Because genre, language, and format match, normalized score should be >= 90% despite missing subjects
  assert.ok(scoreWithoutSubjects.score >= 90)
  assert.ok(scoreWithoutSubjects.unavailableFields.includes('subjects'))
})

test('SimilarityEngine - Ranking and Top Matches', () => {
  const candidate = {
    title: 'Introduction to Algorithms',
    category: 'Computer Science',
    language: 'English',
    subjects: ['algorithms', 'math', 'data structures'],
    format: 'Hardcover',
  }

  const mockLibraryBooks = [
    {
      _id: '1',
      bookName: 'The Pragmatic Programmer',
      category: 'Computer Science',
      language: 'English',
      subjects: ['software', 'programming'],
      shelf: 'TEC-01',
      format: 'Hardcover',
    },
    {
      _id: '2',
      bookName: 'Algorithms Unlocked',
      category: 'Computer Science',
      language: 'English',
      subjects: ['algorithms', 'data structures'],
      shelf: 'TEC-01',
      format: 'Hardcover',
    },
    {
      _id: '3',
      bookName: 'The Lean Startup',
      category: 'Entrepreneurship',
      language: 'English',
      subjects: ['business', 'startups'],
      shelf: 'BUS-01',
      format: 'Paperback',
    },
  ]

  const topMatches = similarityEngine.findTopMatches(candidate, mockLibraryBooks, 5)
  assert.equal(topMatches.length, 3)
  assert.equal(topMatches[0].title, 'Algorithms Unlocked')
  assert.ok(topMatches[0].score > topMatches[1].score)
  assert.ok(topMatches[1].score > topMatches[2].score)

  // Aggregate by shelf
  const shelfAggregations = similarityEngine.groupShelvesByScore(topMatches)
  assert.ok(shelfAggregations.length >= 2)
  assert.equal(shelfAggregations[0].shelfCode, 'TEC-01')
  assert.ok(shelfAggregations[0].score > shelfAggregations[1].score)
  assert.equal(shelfAggregations[0].matchedBooksCount, 2)
})

test('ShelfService - Capacity and policy eligibility checks', () => {
  const mockShelf: IShelf = {
    shelfCode: 'TEC-01',
    shelfName: 'Tech Shelf',
    allowedGenres: ['Computer Science', 'Technology'],
    allowedLanguages: ['English'],
    allowedFormats: ['Hardcover', 'Paperback'],
    maxCapacity: 20,
    currentOccupancy: 19,
    isActive: true,
  } as IShelf

  // 1. Can accept 1 copy of eligible book
  const validBook = {
    category: 'Computer Science',
    language: 'English',
    format: 'Hardcover',
    noOfCopies: 1,
  }
  const eligibleResult = ShelfService.validateShelfEligibility(mockShelf, validBook)
  assert.equal(eligibleResult.isEligible, true)

  // 2. Cannot accept 2 copies (exceeds capacity: 19 + 2 > 20)
  const tooManyCopies = { ...validBook, noOfCopies: 2 }
  const capacityResult = ShelfService.validateShelfEligibility(mockShelf, tooManyCopies)
  assert.equal(capacityResult.isEligible, false)
  assert.match(capacityResult.rejectionReason || '', /full/)

  // 3. Rejects disallowed genre
  const wrongGenre = { ...validBook, category: 'Cookbooks', noOfCopies: 1 }
  const genreResult = ShelfService.validateShelfEligibility(mockShelf, wrongGenre)
  assert.equal(genreResult.isEligible, false)
  assert.match(genreResult.rejectionReason || '', /genre/)

  // 4. Inactive shelf rejection
  const inactiveShelf = { ...mockShelf, isActive: false } as IShelf
  const inactiveResult = ShelfService.validateShelfEligibility(inactiveShelf, validBook)
  assert.equal(inactiveResult.isEligible, false)
  assert.match(inactiveResult.rejectionReason || '', /inactive/)
})
